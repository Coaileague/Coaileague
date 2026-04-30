/**
 * Billing Platform - Full Financial Automation System
 * Combines InvoiceOS (AR) and AI Payroll (HR) into unified billing solution
 * 
 * Features:
 * - Zero-touch usage-based invoicing
 * - Subscription + hybrid billing
 * - Automated delinquency management
 * - Client self-service portal
 * - Tax compliance integration
 * - Employee expense management
 * - Off-cycle payroll runs
 */

import crypto from 'crypto';
import { BILLING, EMAIL } from '../config/platformConfig';
import { db } from "../db";
import { 
  clientPortalAccess,
  invoices, 
  invoiceLineItems, 
  clientRates, 
  paymentRecords,
  expenses,
  timeEntries,
  shifts,
  clients,
  workspaces,
  clientBillingSettings,
  invoiceReminders,
  type Invoice,
  type InsertInvoice,
  type InsertInvoiceLineItem,
  type InsertClientRate,
  type InsertPaymentRecord,
  type InsertInvoiceReminder,
  type ClientRate,
} from '@shared/schema';
import { eq, and, gte, lte, isNull, desc, sql, ne, inArray } from "drizzle-orm";
import { aggregateBillableHours, markEntriesAsBilled, unmarkEntriesAsBilled } from "./automation/billableHoursAggregator";
import { AtomicFinancialLockService } from "./atomicFinancialLockService";
import { platformEventBus } from "./platformEventBus";
import { publishEvent } from "./orchestration/pipelineErrorHandler";
import { calculateStateTax, calculateBonusTaxation } from "./taxCalculator";
import Stripe from "stripe";
import { getStripe } from "./billing/stripeClient";
import { emailService } from './emailService';
import { sendInvoiceGeneratedEmail } from './emailCore';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { createLogger } from '../lib/logger';
const log = createLogger('billingAutomation');


/**
 * PHASE 4A: AUTOMATED INVOICING & REVENUE STREAM (Subscriber's AR)
 */

/**
 * Zero-Touch Usage-Based Invoicing (PRODUCTION)
 * Uses billable hours aggregator for accurate OT/regular/holiday calculation
 * Generates draft invoices requiring manager approval before sending to clients
 */
export async function generateUsageBasedInvoices(workspaceId: string, generateDate?: Date) {
  const targetDate = generateDate || new Date();
  targetDate.setHours(0, 0, 0, 0);
  
  // Get previous day's range for unbilled hours
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date(targetDate);
  
  // Use production aggregator for FLSA-compliant OT calculation
  const aggregationResult = await aggregateBillableHours({
    workspaceId,
    startDate,
    endDate,
  });
  
  // Log warnings for human review (surfaced in invoice review dashboard)
  if (aggregationResult.warnings.length > 0) {
    log.warn('[Billing Platform] Billable hours aggregation warnings:', aggregationResult.warnings);
  }
  
  // Check for critical warnings that should block invoice generation
  const criticalWarnings = aggregationResult.warnings.filter(w => 
    w.includes('missing clock-out') || 
    w.includes('fell back to workspace default') ||
    w.includes('No billing rate configured')
  );
  
  if (criticalWarnings.length > 0) {
    log.error('[Billing Platform] Critical warnings detected - invoices require manual review:', criticalWarnings);
    // Continue generation but flag for review (warnings stored with invoice)
  }
  
  const generatedInvoices: Invoice[] = [];
  const failedClients: Array<{ clientName: string; clientId: string; error: string }> = [];
  
  for (const clientSummary of aggregationResult.clientSummaries) {
    try {
      const allTimeEntryIds = clientSummary.entries.map((entry: any) => entry.timeEntryId);
      const invoice = await createInvoiceFromBillableSummary(
        workspaceId,
        clientSummary,
        aggregationResult.warnings.filter(w =>
          w.includes(clientSummary.clientId) || w.includes(clientSummary.clientName)
        ),
        allTimeEntryIds
      );
      generatedInvoices.push(invoice);
      // DUAL-EMIT LAW: publish invoice_created so Trinity + automationTriggerService
      // receive this event for nightly batch-generated invoices (not just manual creation).
      platformEventBus.publish({
        type: 'invoice_created',
        category: 'automation',
        title: `Invoice Auto-Generated — ${clientSummary.clientName}`,
        description: `Nightly billing run created invoice ${invoice.invoiceNumber || invoice.id} for ${clientSummary.clientName}`,
        workspaceId,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientId: clientSummary.clientId,
          clientName: clientSummary.clientName,
          total: invoice.total,
          source: 'nightly_billing_automation',
        },
        visibility: 'manager',
      }).catch((err: unknown) => {
        log.warn('[BillingAutomation] invoice_created event publish failed:', err instanceof Error ? err.message : String(err));
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`[Billing Platform] Failed to generate invoice for client ${clientSummary.clientName}:`, error);
      failedClients.push({ clientName: clientSummary.clientName, clientId: clientSummary.clientId, error: errorMsg });
      platformEventBus.publish({
        type: 'billing_client_failed',
        category: 'billing',
        title: `Invoice Generation Failed: ${clientSummary.clientName}`,
        description: `Could not generate invoice for ${clientSummary.clientName}: ${errorMsg}`,
        workspaceId,
        metadata: { clientId: clientSummary.clientId, clientName: clientSummary.clientName },
      }).catch((err: unknown) => {
        log.warn('[BillingAutomation] billing_client_failed event publish failed:', err instanceof Error ? err.message : String(err));
      });
    }
  }

  // Notify org owner once if any clients failed — batched so we don't spam per-client
  if (failedClients.length > 0) {
    const { notifyWorkspaceFailure } = await import('./orchestration/pipelineErrorHandler');
    const clientList = failedClients.map(f => `• ${f.clientName}: ${f.error}`).join('\n');
    notifyWorkspaceFailure(
      workspaceId,
      `Billing Run: ${failedClients.length} Invoice(s) Failed`,
      `The nightly billing run could not generate invoices for ${failedClients.length} client(s):\n${clientList}`,
      {
        actionUrl: '/billing',
        pipelineName: 'nightly-billing-run',
        stepName: 'invoice-generation',
        remediationHints: [
          'Review the failed clients in the Billing dashboard.',
          'Ensure all client billing rates and time entries are correctly configured.',
          'Manually trigger invoice generation for affected clients if needed.',
          'Contact support if the issue persists.',
        ],
      }
    ).catch((err: unknown) => {
      log.warn('[BillingAutomation] notifyWorkspaceFailure failed:', err instanceof Error ? err.message : String(err));
    });
  }

  if (generatedInvoices.length > 0) {
    try {
      const { financialProcessingFeeService } = await import('./billing/financialProcessingFeeService');
      for (const inv of generatedInvoices) {
        await financialProcessingFeeService.recordInvoiceFee({
          workspaceId,
          referenceId: inv.invoiceNumber || inv.id,
        });
      }
      log.info(`[Billing Platform] Recorded processing fees for ${generatedInvoices.length} invoices`);
    } catch (feeErr: any) {
      log.warn(`[Billing Platform] Processing fee recording for invoice gen failed (non-blocking):`, feeErr.message);
    }
  }
  
  return generatedInvoices;
}

export async function generateInvoiceForClient(
  workspaceId: string,
  clientId: string,
  periodDays: number,
  generateDate?: Date
): Promise<Invoice[]> {
  const targetDate = generateDate || new Date();
  targetDate.setHours(0, 0, 0, 0);

  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - periodDays);
  const endDate = new Date(targetDate);

  const aggregationResult = await aggregateBillableHours({
    workspaceId,
    startDate,
    endDate,
    clientId,
  });

  if (aggregationResult.warnings.length > 0) {
    log.warn(`[Billing] Per-client aggregation warnings (client ${clientId}):`, aggregationResult.warnings);
  }

  const generatedInvoices: Invoice[] = [];

  for (const clientSummary of aggregationResult.clientSummaries) {
    if (clientSummary.clientId !== clientId) continue;
    try {
      const allTimeEntryIds = clientSummary.entries.map((entry: any) => entry.timeEntryId);
      // B1: atomic — invoice + line items + mark-entries in single transaction
      const invoice = await createInvoiceFromBillableSummary(
        workspaceId,
        clientSummary,
        aggregationResult.warnings.filter(w =>
          w.includes(clientSummary.clientId) || w.includes(clientSummary.clientName)
        ),
        allTimeEntryIds
      );
      generatedInvoices.push(invoice);
      // DUAL-EMIT LAW: publish invoice_created so Trinity + automationTriggerService
      // receive this event for per-client auto-generated invoices.
      platformEventBus.publish({
        type: 'invoice_created',
        category: 'automation',
        title: `Invoice Auto-Generated — ${clientSummary.clientName}`,
        description: `Per-client billing run created invoice ${invoice.invoiceNumber || invoice.id} for ${clientSummary.clientName}`,
        workspaceId,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientId: clientSummary.clientId,
          clientName: clientSummary.clientName,
          total: invoice.total,
          source: 'per_client_billing_automation',
        },
        visibility: 'manager',
      }).catch((err: unknown) => {
        log.warn('[BillingAutomation] per-client invoice_created event publish failed:', err instanceof Error ? err.message : String(err));
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`[Billing] Failed per-client invoice for ${clientId}:`, error);

      // Notify org owner directly about this per-client failure
      import('./orchestration/pipelineErrorHandler').then(({ notifyWorkspaceFailure: notify }) => {
        notify(
          workspaceId,
          `Invoice Generation Failed: ${clientSummary.clientName}`,
          `Could not generate an invoice for client "${clientSummary.clientName}": ${errorMsg}`,
          {
            actionUrl: '/billing',
            pipelineName: 'per-client-billing-run',
            stepName: 'invoice-generation',
            remediationHints: [
              'Check that this client has valid billing rates configured.',
              'Verify all associated time entries are complete and approved.',
              'Try generating the invoice manually from the Billing dashboard.',
            ],
          }
        ).catch((notifErr: unknown) => {
          log.warn('[BillingAutomation] notifyWorkspaceFailure for per-client failure failed:', notifErr instanceof Error ? notifErr.message : String(notifErr));
        });
      }).catch((importErr: unknown) => {
        log.warn('[BillingAutomation] Failed to import pipelineErrorHandler:', importErr instanceof Error ? importErr.message : String(importErr));
      });

      platformEventBus.publish({
        type: 'billing_client_failed',
        category: 'billing',
        title: `Invoice Generation Failed: ${clientSummary.clientName}`,
        description: `Could not generate invoice for ${clientSummary.clientName}: ${error instanceof Error ? error.message : String(error)}`,
        workspaceId,
        metadata: { clientId: clientSummary.clientId, clientName: clientSummary.clientName },
      }).catch((err: unknown) => {
        log.warn('[BillingAutomation] billing_client_failed event publish failed:', err instanceof Error ? err.message : String(err));
      });
    }
  }

  if (generatedInvoices.length > 0) {
    try {
      const { financialProcessingFeeService } = await import('./billing/financialProcessingFeeService');
      for (const inv of generatedInvoices) {
        await financialProcessingFeeService.recordInvoiceFee({
          workspaceId,
          referenceId: inv.invoiceNumber || inv.id,
        });
      }
    } catch (feeErr: any) {
      log.warn(`[Billing] Processing fee recording for per-client invoice failed (non-blocking):`, feeErr.message);
    }
  }

  return generatedInvoices;
}

/**
 * Create invoice from billable hours summary with OT/regular/holiday breakdown (PRODUCTION)
 * Generates employee-grouped line items showing hour types for transparency
 * Keeps invoice in DRAFT status requiring manager approval before sending to client
 */
async function createInvoiceFromBillableSummary(
  workspaceId: string,
  clientSummary: any, // ClientBillableSummary from aggregator
  warnings: string[],
  timeEntryIds: string[] // B1: received from caller for atomic marking
) {
  // Get client rate configuration (for subscription billing if applicable)
  const [clientRate] = await db
    .select()
    .from(clientRates)
    .where(
      and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.clientId, clientSummary.clientId!),
        eq(clientRates.isActive, true)
      )
    )
    .limit(1);
  
  // Get workspace for platform fee
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  // Spec Section 4.1: Check client tax-exempt status
  const [clientTaxData] = await db.select({ isTaxExempt: clients.isTaxExempt })
    .from(clients).where(eq(clients.id, clientSummary.clientId!)).limit(1);
  const isClientTaxExempt = clientTaxData?.isTaxExempt ?? false;
  
  // Build line items: Employee-grouped with hour type breakdown
  const lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    employeeId?: string;
    timeEntryIds?: string[];
    serviceDate?: Date | null;
    hourType?: string;
  }> = [];
  
  // Group entries by employee for consolidated line items
  const entriesByEmployee = new Map<string, typeof clientSummary.entries>();
  for (const entry of clientSummary.entries) {
    const key = entry.employeeId;
    if (!entriesByEmployee.has(key)) {
      entriesByEmployee.set(key, []);
    }
    entriesByEmployee.get(key)!.push(entry);
  }
  
  // Generate line items per employee showing hour type breakdown
  // CRITICAL: Sum actual entry amounts (entries may have different rates)
  for (const [employeeId, entries] of Array.from(entriesByEmployee)) {
    const employeeName = entries[0].employeeName;

    // B4: Guard — employees with $0 billing rate are skipped but managers MUST be alerted
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const hasZeroRate = entries.every(e => !e.billingRate || e.billingRate === 0);
    if (hasZeroRate) {
      log.warn(`[BillingAutomation] REVENUE RISK: Skipping ${employeeName} (${employeeId}) — $0 billing rate. Hours will NOT be invoiced to client.`);
      // Emit platform event so this surfaces in the manager dashboard, not just server logs
      publishEvent(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        platformEventBus.publish({
          type: 'billing_rate_missing',
          category: 'billing',
          title: `Missing Billing Rate: ${employeeName}`,
          description: `${employeeName}'s time entries have no billing rate configured — ${entries.reduce((h: number, e: any) => h + (e.totalHours || 0), 0).toFixed(2)} billable hours will NOT appear on the client invoice. Configure a client rate, employee hourly rate, or workspace default rate.`,
          workspaceId,
          metadata: {
            employeeId,
            employeeName,
            clientId: entries[0]?.clientId,
            unbilledHours: entries.reduce((h: number, e: any) => h + (e.totalHours || 0), 0),
            timeEntryIds: entries.map((e: any) => e.timeEntryId),
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: 'revenue_risk',
          },
        }),
        '[BillingAutomation] billing_rate_missing event publish',
      );
      continue;
    }
    
    // Sum up hours and amounts by type - using actual entry amounts for accuracy
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalHoliday = 0;
    let regularAmount = 0;
    let overtimeAmount = 0;
    let holidayAmount = 0;
    const rateSources = new Set<string>();
    // Collect all time entry IDs for this employee's grouped entries
    const allEntryIds: string[] = entries.map((e: any) => e.timeEntryId).filter(Boolean);
    // Use the earliest clock-in date as the service date for these line items
    const earliestClockIn: Date | null = entries.reduce((earliest: Date | null, e: any) => {
      if (!e.clockIn) return earliest;
      const d = new Date(e.clockIn);
      return !earliest || d < earliest ? d : earliest;
    }, null as Date | null);

    for (const entry of entries) {
      totalRegular += entry.regularHours;
      totalOvertime += entry.overtimeHours;
      totalHoliday += entry.holidayHours;
      
      // Use actual amounts from aggregator (preserves mixed-rate accuracy)
      // B2: Use env-configurable BILLING multipliers, not hardcoded 1.5/2.0
      regularAmount += entry.regularHours * entry.billingRate;
      overtimeAmount += entry.overtimeHours * entry.billingRate * BILLING.overtimeMultiplier;
      holidayAmount += entry.holidayHours * entry.billingRate * BILLING.doubleTimeMultiplier;
      
      rateSources.add(entry.rateSource);
    }
    
    // Detect manually-edited entries — flag them in line items + emit platform event
    // This closes the gap where billing was blind to manager corrections
    const manuallyEditedEntries = entries.filter((e: any) => e.manuallyEdited);
    const hasManualEdits = manuallyEditedEntries.length > 0;
    const manualEditSuffix = hasManualEdits ? ' [MANAGER CORRECTED]' : '';

    if (hasManualEdits) {
      const reasons = manuallyEditedEntries
        .map((e: any) => e.manualEditReason)
        .filter(Boolean)
        .join('; ');
      const desc = reasons
        ? `${employeeName}: ${manuallyEditedEntries.length} time entr${manuallyEditedEntries.length === 1 ? 'y was' : 'ies were'} manually corrected before billing. Reason(s): ${reasons}`
        : `${employeeName}: ${manuallyEditedEntries.length} time entr${manuallyEditedEntries.length === 1 ? 'y was' : 'ies were'} manually corrected before billing.`;
      publishEvent(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        platformEventBus.publish({
          type: 'billing_manual_edit_flagged',
          category: 'billing',
          title: `Manual Time Correction Billed: ${employeeName}`,
          description: desc,
          workspaceId,
          metadata: {
            employeeId,
            employeeName,
            clientId: entries[0]?.clientId,
            editedEntryIds: manuallyEditedEntries.map((e: any) => e.timeEntryId),
            totalEditedEntries: manuallyEditedEntries.length,
            reasons,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: 'audit_flag',
          },
        }),
        '[BillingAutomation] billing_manual_edit_flagged event publish',
      );
    }

    // Calculate weighted average rates for display (informational only)
    const avgRegularRate = totalRegular > 0 ? regularAmount / totalRegular : 0;
    const avgOvertimeRate = totalOvertime > 0 ? overtimeAmount / totalOvertime : 0;
    const avgHolidayRate = totalHoliday > 0 ? holidayAmount / totalHoliday : 0;
    
    // Regular hours line item
    if (totalRegular > 0) {
      lineItems.push({
        description: `${employeeName} - Regular Hours${manualEditSuffix}`,
        quantity: totalRegular.toFixed(2),
        unitPrice: avgRegularRate.toFixed(2),
        amount: regularAmount.toFixed(2),
        employeeId,
        timeEntryIds: allEntryIds,
        serviceDate: earliestClockIn,
        hourType: 'regular',
      });
    }
    
    // Overtime hours line item (1.5x billing rate)
    if (totalOvertime > 0) {
      lineItems.push({
        description: `${employeeName} - Overtime Hours (${BILLING.overtimeMultiplier}x)${manualEditSuffix}`,
        quantity: totalOvertime.toFixed(2),
        unitPrice: avgOvertimeRate.toFixed(2),
        amount: overtimeAmount.toFixed(2),
        employeeId,
        timeEntryIds: allEntryIds,
        serviceDate: earliestClockIn,
        hourType: 'overtime',
      });
    }
    
    // Holiday hours line item (2.0x billing rate)
    if (totalHoliday > 0) {
      lineItems.push({
        description: `${employeeName} - Holiday Hours (${BILLING.doubleTimeMultiplier}x)${manualEditSuffix}`,
        quantity: totalHoliday.toFixed(2),
        unitPrice: avgHolidayRate.toFixed(2),
        amount: holidayAmount.toFixed(2),
        employeeId,
        timeEntryIds: allEntryIds,
        serviceDate: earliestClockIn,
        hourType: 'holiday',
      });
    }
  }
  
  // Calculate subtotal from aggregator (already includes OT calculations)
  let subtotal = clientSummary.totalAmount;
  
  // Add subscription fee if hybrid billing
  if (clientRate?.hasSubscription && clientRate.subscriptionAmount) {
    const subscriptionAmount = parseFloat(clientRate.subscriptionAmount);
    const proratedAmount = prorateSubscription(
      subscriptionAmount,
      clientRate.subscriptionFrequency || 'monthly',
      new Date()
    );
    
    lineItems.unshift({
      description: `${clientRate.subscriptionFrequency === 'monthly' ? 'Monthly' : 'Quarterly'} Subscription (Prorated)`,
      quantity: "1",
      unitPrice: proratedAmount.toString(),
      amount: proratedAmount.toString(),
      hourType: 'subscription',
    });
    
    subtotal += proratedAmount;
  }
  
  // Spec Section 4.1: Tax-exempt clients get no tax; taxable clients get state tax.
  // GAP-5 FIX: Use workspace.defaultTaxRate (stored as decimal e.g. 0.08875) first,
  // falling back to calculateStateTax() from the state lookup table only if
  // defaultTaxRate is not configured. This matches the auto-generate endpoint behavior
  // (FIX-1 from previous scan) and prevents two code paths from producing different
  // tax rates for the same workspace/client on the same billing day.
  let taxRate = 0;
  if (!isClientTaxExempt) {
    const workspaceDefaultTaxRate = workspace?.defaultTaxRate
      ? (parseFloat(String(workspace.defaultTaxRate)) || 0)
      : null;

    if (workspaceDefaultTaxRate !== null && !isNaN(workspaceDefaultTaxRate) && workspaceDefaultTaxRate > 0) {
      taxRate = workspaceDefaultTaxRate;
    } else {
      taxRate = await calculateStateTax(
        workspace?.address || '',
        workspace?.taxId || '',
        subtotal
      ) || 0;
    }
  }
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  
  // Calculate platform fee
  const platformFeePercentage = (parseFloat(workspace?.platformFeePercentage || "3.00") || 3.00);
  const platformFeeAmount = total * (platformFeePercentage / 100);
  const businessAmount = total - platformFeeAmount;
  
  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(workspaceId);
  
  // Set due date based on client payment terms (fall back to workspace default, then Net 30)
  const issueDate = new Date();
  const dueDate = new Date();
  const clientSettings = await db.select().from(clientBillingSettings)
    .where(and(
      eq(clientBillingSettings.workspaceId, workspaceId),
      eq(clientBillingSettings.clientId, clientSummary.clientId),
      eq(clientBillingSettings.isActive, true),
    ))
    .limit(1);
  const paymentTerms = clientSettings[0]?.paymentTerms || (workspace as any)?.defaultPaymentTerms || 'net_30';
  const termsDaysMap: Record<string, number> = {
    'due_on_receipt': 0,
    'net_7': 7,
    'net_10': 10,
    'net_15': 15,
    'net_30': 30,
    'net_45': 45,
    'net_60': 60,
    'net_90': 90,
  };
  const dueDays = termsDaysMap[paymentTerms] ?? 30;
  dueDate.setDate(dueDate.getDate() + dueDays);
  
  // B1 FIX: Wrap invoice INSERT + line items INSERT + time entry marking in ONE atomic
  // transaction. If any step fails, the entire operation rolls back — no orphaned invoices,
  // no double-billing, no entries marked billed without a corresponding invoice.
  //
  // RACE-CONDITION FIX: Claim entries via UPDATE *before* inserting the invoice.
  // PostgreSQL row locks acquired by the UPDATE block any concurrent transaction that
  // tries to claim the same entries. The first transaction wins; all others see 0 rows
  // returned (billedAt already set) and throw before an invoice is ever inserted.
  // Previous approach (SELECT then INSERT) had a TOCTOU window where concurrent
  // calls all passed the SELECT check before any committed the UPDATE.
  const invoice = await db.transaction(async (tx) => {
    // Step 1: Create invoice in DRAFT status (requires manager approval before sending to client)
    const [inv] = await tx
      .insert(invoices)
      .values({
        workspaceId,
        clientId: clientSummary.clientId,
        invoiceNumber,
        issueDate,
        dueDate,
        subtotal: subtotal.toFixed(2),
        taxRate: taxRate.toString(),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        platformFeePercentage: platformFeePercentage.toString(),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        businessAmount: businessAmount.toFixed(2),
        status: 'draft',
        notes: [
          `Generated by Trinity Billing Automation | ${invoiceNumber}`,
          ...(warnings.length > 0 ? [`Aggregation Warnings:\n${warnings.join('\n')}`] : []),
        ].join('\n'),
      })
      .returning();

    // Step 2: Create line items linking time entries to the invoice.
    if (lineItems.length > 0) {
      await tx.insert(invoiceLineItems).values(
        lineItems.map((item, idx) => ({
          invoiceId: inv.id,
          workspaceId: inv.workspaceId,
          lineNumber: idx + 1,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
          employeeId: item.employeeId ?? null,
          timeEntryIds: item.timeEntryIds && item.timeEntryIds.length > 0 ? item.timeEntryIds : null,
          timeEntryId: item.timeEntryIds && item.timeEntryIds.length === 1 ? item.timeEntryIds[0] : null,
          serviceDate: item.serviceDate ?? null,
          descriptionData: item.hourType ? {
            officers: item.employeeId ? [item.employeeId] : [],
            schedule_description: item.hourType,
          } : null,
          taxable: true,
        }))
      );
    }

    // Step 3: Atomic stage via the canonical gatekeeper. Replaces the previous
    // inline `update().set({ billedAt })` block, which was missing the
    // status='approved' guard — that bug would let a billing run claim
    // pending or rejected entries. stageForInvoice enforces approved + unbilled
    // and rolls back the entire transaction (invoice + line items + ledger)
    // if any candidate is unavailable.
    if (timeEntryIds.length > 0) {
      const { attached } = await AtomicFinancialLockService.stageForInvoice({
        workspaceId,
        clientId: clientSummary.clientId,
        invoiceId: inv.id,
        timeEntryIds,
        tx,
      });
      log.info(`[BillingAutomation] Atomically staged ${attached} entries on invoice ${inv.id}`);
    }

    // Step 4 (FIX-3): Ledger write INSIDE the transaction.
    // If this fails the entire invoice + claims roll back — books always balance.
    const { writeLedgerEntry } = await import('./orgLedgerService');
    await writeLedgerEntry({
      workspaceId,
      entryType: 'invoice_created',
      direction: 'debit',
      amount: parseFloat(inv.total),
      relatedEntityType: 'invoice',
      relatedEntityId: inv.id,
      invoiceId: inv.id,
      description: `Invoice ${inv.invoiceNumber ?? invoiceNumber} created for ${clientSummary.clientName} — $${inv.total}`,
      metadata: { clientId: clientSummary.clientId, lineItems: lineItems.length },
      tx,
    });

    return inv;
  });

  // GAP FIX 1: Notify org_owner immediately when a draft invoice is created
  if (invoice.status === 'draft') {
    import('./billing/invoiceDraftNotificationService').then(({ notifyDraftInvoiceCreated }) => {
      notifyDraftInvoiceCreated(
        workspaceId,
        invoice.id,
        invoice.invoiceNumber,
        clientSummary.clientName,
        invoice.total,
      ).catch((err: unknown) => {
        log.warn('[BillingAutomation] Draft invoice notification failed (non-blocking):', err instanceof Error ? err.message : String(err));
      });
    }).catch((err: unknown) => {
      log.warn('[BillingAutomation] Draft invoice notification module import failed:', err instanceof Error ? err.message : String(err));
    });
  }

  return invoice;
}

/**
 * Prorate subscription based on frequency and billing period
 */
function prorateSubscription(amount: number, frequency: string, billingDate: Date): number {
  // For simplicity, return full amount - production would calculate partial months
  return amount;
}

/**
 * Generate unique invoice number
 */
async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const { generateTrinityInvoiceNumber } = await import('./trinityInvoiceNumbering');
  return generateTrinityInvoiceNumber(workspaceId, 'client');
}

/**
 * Send invoice to client self-service portal
 */
async function sendInvoiceToClientPortal(invoice: Invoice) {
  // Get or create client portal access
  let [portalAccess] = await db
    .select()
    .from(clientPortalAccess)
    .where(
      and(
        eq(clientPortalAccess.workspaceId, invoice.workspaceId),
        eq(clientPortalAccess.clientId, invoice.clientId),
        eq(clientPortalAccess.isActive, true)
      )
    )
    .limit(1);
  
  if (!portalAccess) {
    // Create new portal access
    const accessToken = generateSecureToken();
    
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);
    
    [portalAccess] = await db
      .insert(clientPortalAccess)
      .values({
        workspaceId: invoice.workspaceId,
        clientId: invoice.clientId,
        accessToken,
        email: client.email || '',
        portalName: `${client.firstName} ${client.lastName} - Billing Portal`,
        isActive: true,
      })
      .returning();
  }
  
  // Send email notification — always use full https:// URL
  const appBase = getAppBaseUrl();
  const portalUrl = `${appBase}/portal/client/${portalAccess.accessToken}`;

  if (!portalAccess.email) {
    log.warn(`[BillingAutomation] sendInvoiceToClientPortal: skipping email for invoice ${invoice.id} — client has no billing email on file`);
    return;
  }

  await sendInvoiceEmail(invoice, portalAccess.email, portalUrl);
  
  // Mark invoice as sent
  await db
    .update(invoices)
    .set({ status: 'sent' })
    .where(eq(invoices.id, invoice.id));
}

/**
 * Generate secure access token
 */
function generateSecureToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Send invoice email to client using the rich branded template from emailCore.
 * Falls back to a minimal plain-HTML send if line item fetch fails.
 */
async function sendInvoiceEmail(invoice: Invoice, clientEmail: string, portalUrl: string) {
  try {
    // Fetch client name and line items for the rich template
    const [clientRow] = await db
      .select({ firstName: clients.firstName, lastName: clients.lastName, companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);

    const lineItemRows = await db
      .select({ description: invoiceLineItems.description, amount: invoiceLineItems.amount })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));

    const clientName = clientRow
      ? (clientRow.companyName
          ? clientRow.companyName
          : (clientRow.firstName && clientRow.lastName)
            ? `${clientRow.firstName} ${clientRow.lastName}`
            : 'Valued Client')
      : 'Valued Client';

    const formattedTotal = Number(invoice.total ?? 0).toFixed(2);
    const formattedDue = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Upon Receipt';
    const issuedSource = (invoice as any).issueDate || invoice.createdAt;
    const formattedIssued = issuedSource
      ? new Date(issuedSource).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const lineItems = lineItemRows.map(li => ({
      description: li.description || 'Security Services',
      amount: Number(li.amount ?? 0).toFixed(2),
    }));

    // If no line items, create a single summary line item
    if (lineItems.length === 0) {
      lineItems.push({ description: 'Security Services', amount: formattedTotal });
    }

    await sendInvoiceGeneratedEmail(
      clientEmail,
      {
        clientName,
        invoiceNumber: invoice.invoiceNumber || invoice.id,
        invoiceDate: formattedIssued,
        dueDate: formattedDue,
        totalAmount: formattedTotal,
        lineItems,
        portalUrl,
      },
      invoice.workspaceId,
      invoice.id,
    );
  } catch (error) {
    log.error('[BillingAutomation] Failed to send invoice email:', error);
  }
}

/**
 * Send invoice via Stripe (Automated Billing)
 * Creates Stripe invoice, adds line items, and sends to client
 */
export async function sendInvoiceViaStripe(invoiceId: string): Promise<{ success: boolean; stripeInvoiceId?: string; error?: string }> {
  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      log.warn('[Billing Platform] Stripe not configured - skipping automated invoice sending');
      return { success: false, error: 'Stripe not configured' };
    }

    // Lazy Stripe singleton (TRINITY.md §F) — replaces per-call new Stripe(...)
    // which leaked sockets and reinitialized on every invocation. The
    // canonical factory in billing/stripeClient.ts handles config and caching.
    const stripe = getStripe();

    // Get invoice with line items and client
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Get client
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);

    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    // Get line items
    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    // Get or create Stripe customer
    let stripeCustomerId = client.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: client.email || undefined,
        name: client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || undefined,
        metadata: {
          coaileagueClientId: client.id,
          workspaceId: invoice.workspaceId,
        },
      // GAP-58 FIX: Deterministic key scoped to client.id — random UUID suffix defeated deduplication.
      }, { idempotencyKey: `cust-create-client-${client.id}` });
      
      stripeCustomerId = customer.id;
      
      // Update client with Stripe customer ID
      await db.update(clients)
        .set({ stripeCustomerId })
        .where(eq(clients.id, client.id));
    }

    // Create Stripe invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice',
      days_until_due: invoice.dueDate
        ? Math.max(1, Math.ceil((new Date(invoice.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 30,
      auto_advance: false,
      metadata: {
        coaileagueInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        workspaceId: invoice.workspaceId,
      },
      description: `Invoice ${invoice.invoiceNumber}`,
      // GAP-58 FIX: invoice.id alone is unique — random UUID suffix defeated Stripe deduplication.
      // On retry (network timeout, server crash), Stripe would have created TWO Stripe invoices
      // for the same platform invoice, resulting in double-billing to the client.
    }, { idempotencyKey: `inv-create-${invoice.id}` });

    // Add line items to Stripe invoice
    // GAP-58 FIX: index-based deterministic key per line item — same retry-safety rationale.
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        description: item.description,
        amount: Math.round(parseFloat(item.amount) * 100), // Convert to cents
        currency: 'usd',
      }, { idempotencyKey: `inv-item-${invoice.id}-${i}` });
    }

    // Finalize and send invoice
    await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    await stripe.invoices.sendInvoice(stripeInvoice.id);

    // Update local invoice record
    await db.update(invoices)
      .set({
        status: 'sent',
        stripeInvoiceId: stripeInvoice.id,
        sentAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    log.info(`✅ [Billing Platform] Invoice ${invoice.invoiceNumber} sent via Stripe (${stripeInvoice.id})`);

    return { success: true, stripeInvoiceId: stripeInvoice.id };

  } catch (error: any) {
    log.error('[Billing Platform] Failed to send invoice via Stripe:', error);
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Determine the billing period date range for a given cycle type.
 * Returns { start, end, isDue } based on the cycle and current date.
 */
function getBillingPeriodForCycle(
  cycle: string,
  endDate: Date,
  billingDayOfWeek?: number | null,
  billingDayOfMonth?: number | null,
): { start: Date; end: Date; isDue: boolean } {
  const now = endDate;
  const dayOfWeek = now.getDay();
  const dayOfMonth = now.getDate();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);

  switch (cycle) {
    case 'daily':
      start.setHours(0, 0, 0, 0);
      return { start, end, isDue: true };

    case 'weekly': {
      const targetDay = billingDayOfWeek ?? 1;
      const isDue = dayOfWeek === targetDay;
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end, isDue };
    }

    case 'bi_weekly': {
      const targetDay = billingDayOfWeek ?? 1;
      const weekOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      const isDue = dayOfWeek === targetDay && weekOfYear % 2 === 0;
      start.setDate(start.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      return { start, end, isDue };
    }

    case 'monthly': {
      const targetDom = billingDayOfMonth ?? 1;
      const isDue = dayOfMonth === targetDom;
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      return { start, end, isDue };
    }

    default:
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end, isDue: true };
  }
}

/**
 * Cycle-Aware Invoice Generation
 * Generates invoices respecting each client's individual billing cycle (daily, weekly, bi_weekly, monthly).
 * Falls back to workspace default (weekly/7-day) for clients without explicit billing settings.
 * Per-client error isolation: one client failure does not block others.
 */
export async function generateWeeklyInvoices(
  workspaceId: string,
  endDate?: Date,
  days: number = 7
) {
  const targetEnd = endDate || new Date();
  targetEnd.setHours(23, 59, 59, 999);

  const fallbackStart = new Date(targetEnd);
  fallbackStart.setDate(fallbackStart.getDate() - days);
  fallbackStart.setHours(0, 0, 0, 0);

  log.info(`[Billing Platform] Cycle-aware invoice generation as of ${targetEnd.toISOString()}`);

  // Fetch workspace-level auto_invoicing_enabled as fallback for auto-send
  const [wsRow] = await db.select({ autoInvoicingEnabled: workspaces.autoInvoicingEnabled })
    .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const workspaceAutoInvoicing = wsRow?.autoInvoicingEnabled ?? false;

  const billingSettings = await db.select().from(clientBillingSettings)
    .where(and(
      eq(clientBillingSettings.workspaceId, workspaceId),
      eq(clientBillingSettings.isActive, true),
    ));

  const settingsByClientId = new Map(billingSettings.map(s => [s.clientId, s]));

  const aggregationResult = await aggregateBillableHours({
    workspaceId,
    startDate: fallbackStart,
    endDate: targetEnd,
  });

  if (aggregationResult.warnings.length > 0) {
    log.warn('[Billing Platform] Aggregation warnings:', aggregationResult.warnings);
  }

  const generatedInvoices: Invoice[] = [];
  const skippedClients: Array<{ clientName: string; reason: string }> = [];
  const failedClients: Array<{ clientName: string; error: string }> = [];
  const invoiceDetails: Array<{
    invoiceNumber: string;
    clientName: string;
    total: number;
    lineItems: number;
    entriesCovered: number;
    billingCycle: string;
  }> = [];

  for (const clientSummary of aggregationResult.clientSummaries) {
    const clientSettings = settingsByClientId.get(clientSummary.clientId);
    const cycle = clientSettings?.billingCycle || 'weekly';
    const period = getBillingPeriodForCycle(
      cycle,
      targetEnd,
      clientSettings?.billingDayOfWeek,
      clientSettings?.billingDayOfMonth,
    );

    // isDue is advisory — it reflects whether today is the client's scheduled billing day.
    // We do NOT gate on isDue here because billedAt IS NULL already prevents double-billing:
    // once a time entry is marked billed it never appears again. Gating on isDue causes
    // approved entries to sit unbilled for up to 6 days (for weekly clients), which breaks
    // the revenue pipeline when the shift completion bridge auto-approves entries mid-week.
    // Log the advisory info but always process approved unbilled entries.
    if (!period.isDue) {
      log.info(
        `[Billing Platform] ${clientSummary.clientName}: Not on scheduled ${cycle} billing day ` +
        `(processing anyway — ${clientSummary.entries.length} approved unbilled entries found)`,
      );
    }

    try {
      const allTimeEntryIds = clientSummary.entries.map((entry: any) => entry.timeEntryId);
      // B1: atomic — invoice + line items + mark-entries in single transaction
      const invoice = await createInvoiceFromBillableSummary(
        workspaceId,
        clientSummary,
        aggregationResult.warnings.filter(w =>
          w.includes(clientSummary.clientId) || w.includes(clientSummary.clientName)
        ),
        allTimeEntryIds
      );
      generatedInvoices.push(invoice);

      // Spec Section 4.2: If auto_send_invoice is enabled, transition draft → sent
      // Fall back to workspace.autoInvoicingEnabled when no per-client setting exists
      const autoSend = clientSettings?.autoSendInvoice ?? workspaceAutoInvoicing;
      if (autoSend && invoice.status === 'draft') {
        try {
          await db.update(invoices)
            .set({ status: 'sent', sentAt: new Date() })
            .where(eq(invoices.id, invoice.id));
          invoice.status = 'sent';
          log.info(`[Billing Platform] Auto-sent invoice ${invoice.invoiceNumber} for ${clientSummary.clientName}`);
        } catch (sendErr: any) {
          log.warn(`[Billing Platform] Auto-send failed for ${invoice.invoiceNumber}:`, sendErr.message);
        }
      }

      invoiceDetails.push({
        invoiceNumber: invoice.invoiceNumber,
        clientName: clientSummary.clientName,
        total: parseFloat(invoice.total),
        lineItems: clientSummary.entries.length,
        entriesCovered: allTimeEntryIds.length,
        billingCycle: cycle,
      });
    } catch (error: any) {
      log.error(`[Billing Platform] Invoice failed for ${clientSummary.clientName}:`, error);
      failedClients.push({
        clientName: clientSummary.clientName,
        error: (error instanceof Error ? error.message : String(error)) || String(error),
      });
    }
  }

  const totalInvoiced = invoiceDetails.reduce((sum, i) => sum + i.total, 0);

  return {
    periodStart: fallbackStart.toISOString(),
    periodEnd: targetEnd.toISOString(),
    daysSpanned: days,
    invoicesGenerated: generatedInvoices.length,
    totalInvoiced: parseFloat(totalInvoiced.toFixed(2)),
    totalBillableFromAggregation: aggregationResult.totalBillableAmount,
    entriesProcessed: aggregationResult.entriesProcessed,
    invoiceDetails,
    skippedClients,
    failedClients,
    warnings: aggregationResult.warnings,
    invoices: generatedInvoices,
  };
}

/**
 * Delinquency Automation - 7/14/30 day reminders
 */
export async function processDelinquentInvoices(workspaceId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find overdue invoices
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        eq(invoices.status, 'sent'),
        lte(invoices.dueDate!, today)
      )
    );
  
  for (const invoice of overdueInvoices) {
    const daysOverdue = Math.floor((today.getTime() - invoice.dueDate!.getTime()) / (1000 * 60 * 60 * 24));

    // Determine reminder type first — skip non-milestone days
    let reminderType: '7_day' | '14_day' | '30_day';
    if (daysOverdue === 7) reminderType = '7_day';
    else if (daysOverdue === 14) reminderType = '14_day';
    else if (daysOverdue >= 30) reminderType = '30_day';
    else continue; // Only send on 7, 14, and 30+ days

    // Check if this milestone reminder was already sent (query by type, not exact day count,
    // so 30_day is only sent once even if the invoice remains overdue for 31, 32, 33... days)
    const [existingReminder] = await db
      .select()
      .from(invoiceReminders)
      .where(
        and(
          eq(invoiceReminders.invoiceId, invoice.id),
          eq(invoiceReminders.reminderType, reminderType)
        )
      )
      .limit(1);
    
    if (existingReminder) continue;
    
    // Get client email
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);
    
    if (!client?.email) {
      log.error(`No email found for client ${invoice.clientId}`);
      continue;
    }

    // Generate payment URL from APP_BASE_URL env var
    const baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      log.error('Cannot generate payment URL: APP_BASE_URL not configured');
      continue;
    }
    const paymentUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/pay-invoice/${invoice.id}`;
    
    // Create reminder record first (for tracking)
    await db.insert(invoiceReminders).values({
      workspaceId,
      invoiceId: invoice.id,
      reminderType,
      daysOverdue,
      emailTo: client.email,
      emailSubject: `Payment Reminder: Invoice ${invoice.invoiceNumber} is ${daysOverdue} Days Overdue`,
      emailBody: 'Sent via standardized template',
      status: 'pending',
      needsHumanIntervention: daysOverdue >= 30,
    });
    
    // Send reminder email using standardized template
    try {
      const { sendInvoiceOverdueReminderEmail } = await import('../email');
      
      await sendInvoiceOverdueReminderEmail(client.email, {
        clientName: client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Valued Customer',
        invoiceNumber: invoice.invoiceNumber,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        total: invoice.total,
        dueDate: invoice.dueDate?.toLocaleDateString('en-US', { dateStyle: 'medium' }) || 'N/A',
        daysOverdue,
        paymentUrl,
      });
      
      // Mark as sent
      await db
        .update(invoiceReminders)
        .set({ status: 'sent', sentAt: new Date() })
        .where(
          and(
            eq(invoiceReminders.invoiceId, invoice.id),
            eq(invoiceReminders.daysOverdue, daysOverdue)
          )
        );
      
      // Update invoice status if 30+ days
      if (daysOverdue >= 30) {
        await db
          .update(invoices)
          .set({ status: 'overdue' })
          .where(eq(invoices.id, invoice.id));

        // AUDIT: Log status transition to overdue with previousState/newState ─────
        // GAP-15 FIX: was fire-and-forget (missing await). If the DB is temporarily
        // unavailable the invoice would be marked overdue in the invoices table but
        // no ledger entry would exist, silently leaving the org ledger out of sync.
        const { writeLedgerEntry } = await import('./orgLedgerService');
        await writeLedgerEntry({
          workspaceId,
          entryType: 'invoice_overdue',
          direction: 'debit',
          relatedEntityType: 'invoice',
          relatedEntityId: invoice.id,
          invoiceId: invoice.id,
          // GAP-27 FIX: invoice_overdue is a STATUS CHANGE marker — it does not represent
          // a new financial transaction. The invoice amount was already recognised as AR by
          // the invoice_created/debit entry. Writing the full amount here as a second debit
          // doubled every overdue invoice in the running balance (e.g. $10k invoice →
          // invoice_created +$10k, invoice_overdue +$10k = $20k — then payment_received
          // -$10k still left $10k on the books). Fix: amount=0 so balanceAfter is unchanged
          // and the entry serves as a pure audit-trail event marker.
          amount: 0,
          description: `Invoice ${invoice.invoiceNumber} automatically marked overdue after ${daysOverdue} days past due`,
          metadata: {
            previousState: { status: invoice.status },
            newState: { status: 'overdue' },
            daysOverdue,
            source: 'billing_automation_overdue_scan',
          },
        }).catch(err => log.error('[BillingAutomation] Failed to log overdue status audit:', err));
        // ─────────────────────────────────────────────────────────────────────────
      }

      // DUAL-EMIT LAW: publish invoice_overdue to platformEventBus so Trinity + automationTriggerService
      // can react (collections escalation, AI alerts, audit trail). Fires for all milestone reminders
      // (7-day, 14-day, 30-day) — Trinity decides which to act on based on daysOverdue.
      publishEvent(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        platformEventBus.publish({
          type: 'invoice_overdue',
          category: 'automation',
          title: `Invoice Overdue — ${daysOverdue} Days`,
          description: `Invoice ${invoice.invoiceNumber} for $${invoice.total} is ${daysOverdue} days past due`,
          workspaceId,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            clientId: invoice.clientId,
            amount: invoice.total,
            daysOverdue,
            reminderType,
            needsHumanIntervention: daysOverdue >= 30,
          },
          visibility: 'manager',
        }),
        '[BillingAutomation] invoice_overdue event publish',
      );
    } catch (error) {
      log.error('Failed to send reminder email:', error);
      await db
        .update(invoiceReminders)
        .set({ status: 'failed', failureReason: String(error) })
        .where(
          and(
            eq(invoiceReminders.invoiceId, invoice.id),
            eq(invoiceReminders.daysOverdue, daysOverdue)
          )
        );
    }
  }
}

/**
 * Process invoice payment via Stripe Connect
 * Supports partial payments — invoice moves to 'partial' status until fully paid.
 */
export async function processInvoicePayment(
  invoiceId: string,
  paymentIntentId: string,
  amount: number
) {
  return await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .for('update')
      .limit(1);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'paid') {
      log.info(`[BillingAutomation] Invoice ${invoiceId} already paid, skipping duplicate`);
      return invoice;
    }

    if (invoice.status === 'cancelled' || invoice.status === 'void') {
      throw new Error(`Cannot process payment for ${invoice.status} invoice`);
    }

    const platformFeeAmount = parseFloat(invoice.platformFeeAmount || "0");
    const businessAmount = parseFloat(invoice.businessAmount || "0");

    await tx.insert(paymentRecords).values({
      workspaceId: invoice.workspaceId,
      invoiceId: invoice.id,
      amount: amount.toString(),
      paymentMethod: 'stripe_card',
      paymentIntentId,
      status: 'completed',
      paidAt: new Date(),
      platformFeeAmount: platformFeeAmount.toString(),
      businessAmount: businessAmount.toString(),
    });

    const existingPayments = await tx.select({
      totalPaid: sql<string>`COALESCE(SUM(${paymentRecords.amount}), 0)`,
    }).from(paymentRecords).where(and(
      eq(paymentRecords.invoiceId, invoice.id),
      eq(paymentRecords.status, 'completed'),
    ));

    const totalPaid = parseFloat(existingPayments[0]?.totalPaid || '0') + amount;
    const invoiceTotal = parseFloat(invoice.total);
    const isFullyPaid = totalPaid >= invoiceTotal;

    const [updated] = await tx
      .update(invoices)
      .set({
        status: isFullyPaid ? 'paid' : 'partial',
        paidAt: isFullyPaid ? new Date() : undefined,
        paymentIntentId,
      })
      .where(eq(invoices.id, invoice.id))
      .returning();

    log.info(`[BillingAutomation] Payment recorded: $${amount} on invoice ${invoice.invoiceNumber} (total paid: $${totalPaid}/${invoiceTotal}, status: ${isFullyPaid ? 'paid' : 'partial'})`);

    return updated;
  });
}

/**
 * Invoice Aging Report
 * Generates aging buckets (current, 30-day, 60-day, 90-day, 90+ day) for all unpaid invoices.
 */
export async function generateAgingReport(workspaceId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const unpaidInvoices = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    clientId: invoices.clientId,
    total: invoices.total,
    dueDate: invoices.dueDate,
    status: invoices.status,
    invoiceDate: invoices.issueDate,
  }).from(invoices).where(and(
    eq(invoices.workspaceId, workspaceId),
    ne(invoices.status, 'paid'),
    ne(invoices.status, 'cancelled'),
    ne(invoices.status, 'void'),
  ));

  const buckets = {
    current: [] as any[],
    thirtyDay: [] as any[],
    sixtyDay: [] as any[],
    ninetyDay: [] as any[],
    ninetyPlus: [] as any[],
  };

  for (const inv of unpaidInvoices) {
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate || today);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    const entry = { ...inv, daysOverdue };

    if (daysOverdue <= 0) buckets.current.push(entry);
    else if (daysOverdue <= 30) buckets.thirtyDay.push(entry);
    else if (daysOverdue <= 60) buckets.sixtyDay.push(entry);
    else if (daysOverdue <= 90) buckets.ninetyDay.push(entry);
    else buckets.ninetyPlus.push(entry);
  }

  const sumBucket = (b: any[]) => b.reduce((s, i) => s + parseFloat(i.total || '0'), 0);

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    summary: {
      current: { count: buckets.current.length, total: sumBucket(buckets.current) },
      thirtyDay: { count: buckets.thirtyDay.length, total: sumBucket(buckets.thirtyDay) },
      sixtyDay: { count: buckets.sixtyDay.length, total: sumBucket(buckets.sixtyDay) },
      ninetyDay: { count: buckets.ninetyDay.length, total: sumBucket(buckets.ninetyDay) },
      ninetyPlus: { count: buckets.ninetyPlus.length, total: sumBucket(buckets.ninetyPlus) },
      totalOutstanding: sumBucket(unpaidInvoices),
    },
    buckets,
  };
}

/**
 * PHASE 4B: FULL-SERVICE PAYROLL & LIABILITY (Subscriber's HR)
 * These functions integrate with the existing AI Payroll™ system
 */

/**
 * Process approved expense reports and include in next payroll run
 */
export async function getApprovedExpensesForPayroll(
  workspaceId: string,
  employeeId: string
): Promise<number> {
  const [result] = await db
    .select({
      totalReimbursement: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.employeeId, employeeId),
        eq(expenses.status, 'approved'),
        isNull(expenses.reimbursedAt)
      )
    );
  
  return parseFloat(result?.totalReimbursement || "0");
}

/**
 * Mark expenses as reimbursed in payroll run
 */
export async function markExpensesReimbursed(
  workspaceId: string,
  employeeId: string,
  payrollRunId: string
) {
  await db
    .update(expenses)
    .set({
      reimbursementReference: payrollRunId,
      reimbursedAt: new Date(),
      status: 'reimbursed',
    })
    .where(
      and(
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.employeeId, employeeId),
        eq(expenses.status, 'approved')
      )
    );
}

/**
 * GAP-016 FIX: Cascade time entry edits to linked invoices.
 *
 * Called after a time entry is updated. Handles two scenarios:
 *   A) Draft invoice → void it, unmark all its entries (they become available
 *      for the next billing run which will regenerate with corrected amounts).
 *   B) Sent / pending / overdue invoice → create a ledger adjustment entry
 *      recording the dollar difference so the books stay accurate.
 *      A credit memo flag is set on the invoice notes for manager visibility.
 *
 * Returns a summary object describing what action was taken (if any).
 */
export async function cascadeTimeEntryEditToInvoice(params: {
  timeEntryId: string;
  invoiceId: string;
  workspaceId: string;
  oldTotalAmount: string | null;
  newTotalAmount: string | null;
  editReason: string;
  editedBy: string;
}): Promise<{ action: 'voided_draft' | 'ledger_adjustment' | 'no_action'; invoiceId: string; details: string }> {
  const { timeEntryId, invoiceId, workspaceId, oldTotalAmount, newTotalAmount, editReason, editedBy } = params;

  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
    .limit(1);

  if (!invoice) {
    return { action: 'no_action', invoiceId, details: 'Linked invoice not found' };
  }

  if (invoice.status === 'void' || invoice.status === 'cancelled') {
    return { action: 'no_action', invoiceId, details: 'Invoice already voided/cancelled' };
  }

  const oldAmt = parseFloat(oldTotalAmount || '0');
  const newAmt = parseFloat(newTotalAmount || '0');
  const difference = newAmt - oldAmt;

  if (invoice.status === 'draft') {
    const { unmarkEntriesAsBilled } = await import('./automation/billableHoursAggregator');

    await db.transaction(async (tx) => {
      await tx.update(invoices)
        .set({
          status: 'void',
          notes: [
            invoice.notes || '',
            `\n[AUTO-VOIDED] Time entry ${timeEntryId} edited (${editReason}). Original total: $${oldAmt.toFixed(2)} → $${newAmt.toFixed(2)}. Voided by system to trigger regeneration.`,
          ].join(''),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      const { writeLedgerEntry } = await import('./orgLedgerService');
      if (parseFloat(invoice.total) > 0) {
        await writeLedgerEntry({
          workspaceId,
          entryType: 'adjustment',
          direction: 'credit',
          amount: parseFloat(invoice.total),
          invoiceId,
          relatedEntityType: 'invoice',
          relatedEntityId: invoiceId,
          description: `Voided draft invoice ${invoice.invoiceNumber} — time entry edited (${editReason})`,
          createdBy: editedBy,
          metadata: { timeEntryId, oldAmount: oldAmt, newAmount: newAmt, reason: editReason },
        });
      }
    });

    const { unmarkEntriesAsBilled: unmark } = await import('./automation/billableHoursAggregator');
    await unmark(invoiceId);

    log.info(`[GAP-016] Voided draft invoice ${invoice.invoiceNumber} — time entry ${timeEntryId} edited. Entries unmarked for rebilling.`);
    return {
      action: 'voided_draft',
      invoiceId,
      details: `Draft invoice ${invoice.invoiceNumber} voided. ${oldAmt !== newAmt ? `Amount changed $${oldAmt.toFixed(2)} → $${newAmt.toFixed(2)}.` : ''} Entries released for rebilling.`,
    };
  }

  if (['sent', 'pending', 'overdue'].includes(invoice.status!)) {
    if (Math.abs(difference) < 0.01) {
      return { action: 'no_action', invoiceId, details: 'Amount unchanged — no adjustment needed' };
    }

    const { writeLedgerEntry } = await import('./orgLedgerService');
    await writeLedgerEntry({
      workspaceId,
      entryType: 'adjustment',
      direction: difference < 0 ? 'credit' : 'debit',
      amount: Math.abs(difference),
      invoiceId,
      relatedEntityType: 'invoice',
      relatedEntityId: invoiceId,
      description: `Credit memo: time entry ${timeEntryId} edited on sent invoice ${invoice.invoiceNumber} (${editReason}). Adjustment: $${difference.toFixed(2)}`,
      createdBy: editedBy,
      metadata: { timeEntryId, oldAmount: oldAmt, newAmount: newAmt, invoiceStatus: invoice.status, reason: editReason },
    });

    await db.update(invoices)
      .set({
        notes: [
          invoice.notes || '',
          `\n[ADJUSTMENT] Time entry ${timeEntryId} edited after invoice sent. Original: $${oldAmt.toFixed(2)} → $${newAmt.toFixed(2)}. Ledger adjustment recorded. Review required.`,
        ].join(''),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    log.info(`[GAP-016] Ledger adjustment for sent invoice ${invoice.invoiceNumber} — $${difference.toFixed(2)} (time entry ${timeEntryId} edited)`);
    return {
      action: 'ledger_adjustment',
      invoiceId,
      details: `Sent invoice ${invoice.invoiceNumber} — ledger adjustment of $${difference.toFixed(2)} recorded. Credit memo noted.`,
    };
  }

  return { action: 'no_action', invoiceId, details: `Invoice status '${invoice.status}' — no automatic cascade` };
}
