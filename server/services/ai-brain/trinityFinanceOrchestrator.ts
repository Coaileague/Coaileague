/**
 * TRINITY FINANCE ORCHESTRATOR
 * ============================
 * Unified financial workflow engine for Trinity AI.
 * 
 * Operates in two modes automatically detected at runtime:
 *   QB_MODE    — workspace has an active QuickBooks connection
 *   INTERNAL   — no QB, or QB is disconnected/expired
 * 
 * In QB_MODE:  gathers QB data + CoAIleague data → generates QB-formatted
 *              invoices and payroll that can be pushed directly to QBO.
 * In INTERNAL: uses only CoAIleague operational data → generates fully
 *              functional internal invoices and payroll (no QB required).
 * 
 * Both modes produce identical outcome quality. QB_MODE adds sync.
 * 
 * Actions registered with Platform Action Hub:
 *   finance.get_connection_status — detect QB vs internal mode
 *   finance.gather_snapshot       — pull full financial dataset
 *   finance.draft_invoices        — generate draft invoices (auto-mode)
 *   finance.draft_payroll         — generate draft payroll run (auto-mode)
 *   finance.push_to_qb            — push draft invoice or payroll to QBO
 *   finance.reconcile             — QB vs CoAIleague variance report
 */

import { db } from '../../db';
import {
  partnerConnections,
  clients,
  employees,
  timeEntries,
  shifts,
  payrollRuns,
  payrollEntries,
  invoices,
  workspaces,
} from '@shared/schema';
import {
  eq, and, gte, lte, desc, isNull, isNotNull, sql, count, sum,
} from 'drizzle-orm';
import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityFinanceOrchestrator');

// ─── Types ───────────────────────────────────────────────────────────────────

export type FinanceMode = 'QB_MODE' | 'INTERNAL';

export interface WorkspaceFinanceMode {
  mode: FinanceMode;
  qbConnected: boolean;
  qbRealmId: string | null;
  qbLastSync: Date | null;
  qbStatus: 'connected' | 'disconnected' | 'expired' | 'error' | 'not_configured';
  internalPayrollEnabled: boolean;
  internalInvoicingEnabled: boolean;
  recommendation: string;
}

export interface FinancialSnapshot {
  mode: FinanceMode;
  asOf: Date;
  workspaceId: string;

  unbilledWork: {
    clientCount: number;
    totalUnbilledHours: number;
    estimatedRevenue: number;
    byClient: {
      clientId: string;
      clientName: string;
      unbilledHours: number;
      estimatedRevenue: number;
      lastEntryDate: Date | null;
    }[];
  };

  openPayrollPeriod: {
    periodStart: Date | null;
    periodEnd: Date | null;
    employeeCount: number;
    totalHours: number;
    estimatedGrossPayroll: number;
    unapprovedEntryCount: number;
  };

  pendingInvoices: {
    count: number;
    totalAmount: number;
    oldestDraftDays: number;
  };

  qbSnapshot: {
    arAgingTotal: number;
    overdueCount: number;
    lastSyncAge: string;
    syncHealth: 'healthy' | 'stale' | 'disconnected';
  } | null;

  dataQuality: {
    score: number;
    missingRates: number;
    unapprovedEntries: number;
    warnings: string[];
  };
}

export interface DraftInvoicesResult {
  mode: FinanceMode;
  drafted: number;
  skipped: number;
  errors: number;
  invoiceIds: string[];
  qbSyncScheduled: boolean;
  summary: string;
}

export interface DraftPayrollResult {
  mode: FinanceMode;
  payrollRunId: string | null;
  employeeCount: number;
  totalGrossPay: number;
  periodStart: string;
  periodEnd: string;
  qbSyncScheduled: boolean;
  status: 'draft' | 'failed';
  summary: string;
}

// ─── Helper: result factory ───────────────────────────────────────────────────

function ok(actionId: string, message: string, data: any, start: number): ActionResult {
  return { success: true, actionId, message, data, executionTimeMs: Date.now() - start };
}

function fail(actionId: string, message: string, data: any, start: number): ActionResult {
  return { success: false, actionId, message, data, executionTimeMs: Date.now() - start };
}

// ─── QB Connection Detection ──────────────────────────────────────────────────

async function detectFinanceMode(workspaceId: string): Promise<WorkspaceFinanceMode> {
  const connection = await db
    .select()
    .from(partnerConnections)
    .where(
      and(
        eq(partnerConnections.workspaceId, workspaceId),
        eq(partnerConnections.partnerType, 'quickbooks')
      )
    )
    .limit(1)
    .then(r => r[0] ?? null);

  const workspace = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .then(r => r[0] ?? null);

  if (!connection) {
    return {
      mode: 'INTERNAL',
      qbConnected: false,
      qbRealmId: null,
      qbLastSync: null,
      qbStatus: 'not_configured',
      internalPayrollEnabled: !!workspace,
      internalInvoicingEnabled: !!workspace,
      recommendation: 'QuickBooks is not connected. All invoices and payroll will be created internally — fully functional without QB.',
    };
  }

  const status = connection.status as string;
  const connected = status === 'connected';
  const expired = status === 'expired';

  let qbStatus: WorkspaceFinanceMode['qbStatus'] = 'disconnected';
  if (connected) qbStatus = 'connected';
  else if (expired) qbStatus = 'expired';
  else if (status === 'error') qbStatus = 'error';

  const mode: FinanceMode = connected ? 'QB_MODE' : 'INTERNAL';

  let recommendation = '';
  if (connected) {
    recommendation = 'QuickBooks is connected. Invoices and payroll will be generated internally and synced to QBO automatically.';
  } else if (expired) {
    recommendation = 'QuickBooks OAuth has expired. Reconnect to resume QB sync. All internal operations continue to work normally.';
  } else {
    recommendation = 'QuickBooks is not active. Running in internal mode — fully functional.';
  }

  return {
    mode,
    qbConnected: connected,
    qbRealmId: (connection as any).realmId ?? null,
    qbLastSync: (connection as any).updatedAt ?? null,
    qbStatus,
    internalPayrollEnabled: true,
    internalInvoicingEnabled: true,
    recommendation,
  };
}

// ─── Financial Snapshot ───────────────────────────────────────────────────────

async function buildFinancialSnapshot(workspaceId: string): Promise<FinancialSnapshot> {
  const modeInfo = await detectFinanceMode(workspaceId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Parallel data gathering
  const [
    unbilledEntries,
    pendingInvoiceData,
    recentPayrollRun,
    allClients,
    allEmployees,
  ] = await Promise.all([
    // Uninvoiced approved time entries
    db
      .select({
        clientId: timeEntries.clientId,
        hours: sql<number>`COALESCE(${timeEntries.totalHours}, 0)::numeric`,
        rate: sql<number>`COALESCE(${timeEntries.capturedBillRate}, 0)::numeric`,
        date: timeEntries.date,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.status, 'approved'),
          isNull(timeEntries.billedAt),
          gte(timeEntries.date, sixtyDaysAgo.toISOString().split('T')[0])
        )
      ),

    // Pending (draft) invoices
    db
      .select({
        count: count(),
        total: sum(invoices.total),
        minCreated: sql<Date>`MIN(${invoices.createdAt})`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'draft')
        )
      )
      .then(r => r[0]),

    // Most recent payroll run
    db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, workspaceId))
      .orderBy(desc(payrollRuns.createdAt))
      .limit(1)
      .then(r => r[0] ?? null),

    // All active clients for name lookup
    db
      .select({ id: clients.id, name: clients.companyName, defaultHourlyRate: clients.contractRate })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId)),

    // All active employees for payroll estimate
    db
      .select({ id: employees.id, hourlyRate: employees.hourlyRate, status: employees.status })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active'))),
  ]);

  // Build per-client unbilled summary
  const clientMap = new Map(allClients.map(c => [c.id, c]));
  const byClientMap = new Map<string, { clientId: string; clientName: string; hours: number; revenue: number; lastDate: Date | null }>();

  let totalUnbilledHours = 0;
  let totalEstimatedRevenue = 0;

  for (const entry of unbilledEntries) {
    const clientId = entry.clientId ?? 'unknown';
    const client = clientMap.get(clientId ?? '');
    const hours = Number(entry.hours) || 0;
    const rate = Number(entry.rate) || Number(client?.defaultHourlyRate) || 0;
    const revenue = hours * rate;

    totalUnbilledHours += hours;
    totalEstimatedRevenue += revenue;

    const existing = byClientMap.get(clientId);
    const entryDate = entry.date ? new Date(entry.date) : null;

    if (existing) {
      existing.hours += hours;
      existing.revenue += revenue;
      if (entryDate && (!existing.lastDate || entryDate > existing.lastDate)) {
        existing.lastDate = entryDate;
      }
    } else {
      byClientMap.set(clientId, {
        clientId,
        clientName: client?.companyName ?? 'Unknown Client',
        hours,
        revenue,
        lastDate: entryDate,
      });
    }
  }

  // Pending invoices
  const pendingCount = Number(pendingInvoiceData?.count) || 0;
  const pendingTotal = Number(pendingInvoiceData?.total) || 0;
  const oldestDraft = pendingInvoiceData?.minCreated ? new Date(pendingInvoiceData.minCreated) : null;
  const oldestDraftDays = oldestDraft ? Math.floor((now.getTime() - oldestDraft.getTime()) / 86400000) : 0;

  // Payroll period estimate from last run
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  if (recentPayrollRun) {
    const lastEnd = new Date(recentPayrollRun.periodEnd as any);
    periodStart = new Date(lastEnd.getTime() + 86400000);
    periodEnd = new Date(periodStart.getTime() + 6 * 86400000);
  } else {
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    periodStart = monday;
    periodEnd = new Date(monday.getTime() + 6 * 86400000);
  }

  // Count unapproved time entries in the estimated pay period
  const unapprovedEntries = await db
    .select({ count: count() })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status, 'pending'),
        gte(timeEntries.date, periodStart.toISOString().split('T')[0]),
        lte(timeEntries.date, periodEnd.toISOString().split('T')[0])
      )
    )
    .then(r => Number(r[0]?.count) || 0);

  // Estimate payroll from approved entries in period
  const periodEntries = await db
    .select({
      hours: sql<number>`COALESCE(${timeEntries.totalHours}, 0)::numeric`,
      rate: sql<number>`COALESCE(${timeEntries.capturedPayRate}, 0)::numeric`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status, 'approved'),
        gte(timeEntries.date, periodStart.toISOString().split('T')[0]),
        lte(timeEntries.date, periodEnd.toISOString().split('T')[0])
      )
    );

  const totalPayrollHours = periodEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const estimatedGrossPayroll = periodEntries.reduce((s, e) => {
    const h = Number(e.hours) || 0;
    const r = Number(e.rate) || 0;
    return s + (h * r);
  }, 0);

  // Data quality
  const missingRates = byClientMap.size > 0
    ? [...byClientMap.values()].filter(c => c.revenue === 0 && c.hours > 0).length
    : 0;

  const warnings: string[] = [];
  if (missingRates > 0) warnings.push(`${missingRates} client(s) missing billing rates — revenue estimate is understated`);
  if (unapprovedEntries > 0) warnings.push(`${unapprovedEntries} time entries are pending approval — payroll may be understated`);
  if (oldestDraftDays > 14) warnings.push(`Oldest draft invoice is ${oldestDraftDays} days old — consider sending or voiding`);

  const dataQualityScore = Math.max(0, 100 - missingRates * 10 - (unapprovedEntries > 5 ? 20 : 0) - (oldestDraftDays > 30 ? 10 : 0));

  // QB snapshot (if connected)
  let qbSnapshot: FinancialSnapshot['qbSnapshot'] = null;
  if (modeInfo.qbConnected) {
    try {
      const { trinityQuickBooksSnapshotService } = await import('./trinityQuickBooksSnapshot');
      const snap = await trinityQuickBooksSnapshotService.getFinancialSnapshot(workspaceId);

      const arTotal = snap.arAging.reduce((s: any, b: any) => s + b.totalAmount, 0);
      const overdueCount = snap.overdueInvoices.length;

      let lastSyncAge = 'never';
      if (snap.syncHealth.lastSuccessfulSync) {
        const ageMs = now.getTime() - new Date(snap.syncHealth.lastSuccessfulSync).getTime();
        const ageH = Math.floor(ageMs / 3600000);
        lastSyncAge = ageH < 1 ? 'just now' : ageH < 24 ? `${ageH}h ago` : `${Math.floor(ageH / 24)}d ago`;
      }

      const syncHealth: 'healthy' | 'stale' | 'disconnected' =
        snap.syncHealth.connectionStatus === 'connected'
          ? (snap.syncHealth.errorCount > 0 ? 'stale' : 'healthy')
          : 'disconnected';

      qbSnapshot = { arAgingTotal: arTotal, overdueCount, lastSyncAge, syncHealth };
    } catch {
      qbSnapshot = null;
    }
  }

  return {
    mode: modeInfo.mode,
    asOf: now,
    workspaceId,
    unbilledWork: {
      clientCount: byClientMap.size,
      totalUnbilledHours: Math.round(totalUnbilledHours * 10) / 10,
      estimatedRevenue: Math.round(totalEstimatedRevenue * 100) / 100,
      byClient: [...byClientMap.values()].map(c => ({
        clientId: c.clientId,
        clientName: c.clientName,
        unbilledHours: Math.round(c.hours * 10) / 10,
        estimatedRevenue: Math.round(c.revenue * 100) / 100,
        lastEntryDate: c.lastDate,
      })).sort((a, b) => b.estimatedRevenue - a.estimatedRevenue),
    },
    openPayrollPeriod: {
      periodStart,
      periodEnd,
      employeeCount: allEmployees.length,
      totalHours: Math.round(totalPayrollHours * 10) / 10,
      estimatedGrossPayroll: Math.round(estimatedGrossPayroll * 100) / 100,
      unapprovedEntryCount: unapprovedEntries,
    },
    pendingInvoices: {
      count: pendingCount,
      totalAmount: pendingTotal,
      oldestDraftDays,
    },
    qbSnapshot,
    dataQuality: {
      score: dataQualityScore,
      missingRates,
      unapprovedEntries,
      warnings,
    },
  };
}

// ─── Draft Invoices ───────────────────────────────────────────────────────────

async function runDraftInvoices(workspaceId: string, requestedBy: string): Promise<DraftInvoicesResult> {
  const modeInfo = await detectFinanceMode(workspaceId);

  const { getUninvoicedTimeEntries, generateInvoiceFromHours } = await import('../timesheetInvoiceService');

  const uninvoicedData = await getUninvoicedTimeEntries(workspaceId);
  const byClient = uninvoicedData.summary?.byClient ?? {};
  const clientIds = Object.keys(byClient);

  if (clientIds.length === 0) {
    return {
      mode: modeInfo.mode,
      drafted: 0,
      skipped: 0,
      errors: 0,
      invoiceIds: [],
      qbSyncScheduled: false,
      summary: 'No uninvoiced work found. All approved time entries are already billed.',
    };
  }

  const invoiceIds: string[] = [];
  let drafted = 0;
  let skipped = 0;
  let errors = 0;

  // Use last 60 days as the billing window
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000);

  for (const clientId of clientIds) {
    const clientSummary = byClient[clientId];
    if (!clientSummary || clientSummary.count === 0) {
      skipped++;
      continue;
    }

    try {
      const result = await generateInvoiceFromHours({
        workspaceId,
        clientId,
        startDate,
        endDate,
        groupByEmployee: true,
        dueInDays: 30,
      });

      if (result.invoice) {
        invoiceIds.push(result.invoice.id);
        drafted++;

        // In QB_MODE: process through financial pipeline (auto-sync if high confidence)
        if (modeInfo.qbConnected) {
          const { processInvoiceThroughPipeline } = await import('../financialPipelineOrchestrator');
          processInvoiceThroughPipeline(result.invoice.id, workspaceId).catch((err) => log.warn('[trinityFinanceOrchestrator] Fire-and-forget failed:', err));
        }
      } else {
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  const qbSyncScheduled = modeInfo.qbConnected && drafted > 0;
  const modeLabel = modeInfo.qbConnected ? 'QuickBooks sync scheduled' : 'internal mode — no QB push needed';

  return {
    mode: modeInfo.mode,
    drafted,
    skipped,
    errors,
    invoiceIds,
    qbSyncScheduled,
    summary: `Drafted ${drafted} invoice(s) for ${clientIds.length} client(s). ${skipped} skipped, ${errors} failed. Mode: ${modeLabel}.`,
  };
}

// ─── Draft Payroll ────────────────────────────────────────────────────────────

async function runDraftPayroll(workspaceId: string, requestedBy: string, overrides?: { periodStart?: string; periodEnd?: string }): Promise<DraftPayrollResult> {
  const modeInfo = await detectFinanceMode(workspaceId);

  let periodStartDate: Date;
  let periodEndDate: Date;

  try {
    const { createAutomatedPayrollRun, detectPayPeriod } = await import('../payrollAutomation');

    if (overrides?.periodStart && overrides?.periodEnd) {
      periodStartDate = new Date(overrides.periodStart);
      periodEndDate = new Date(overrides.periodEnd);
    } else {
      const detected = await detectPayPeriod(workspaceId);
      periodStartDate = detected?.periodStart ?? new Date(Date.now() - 7 * 86400000);
      periodEndDate = detected?.periodEnd ?? new Date();
    }

    const result = await createAutomatedPayrollRun({
      workspaceId,
      createdBy: requestedBy,
      periodStart: periodStartDate,
      periodEnd: periodEndDate,
    });

    const totalGross = result.totalGrossPay ?? 0;
    const employeeCount = result.totalEmployees ?? 0;
    const periodStart = periodStartDate.toISOString().split('T')[0];
    const periodEnd = periodEndDate.toISOString().split('T')[0];

    // In QB_MODE: trigger pipeline (will try to sync payroll to QB if high confidence)
    if (modeInfo.qbConnected && result.payrollRunId) {
      const { processPayrollThroughPipeline } = await import('../financialPipelineOrchestrator');
      processPayrollThroughPipeline(result.payrollRunId, workspaceId).catch((err) => log.warn('[trinityFinanceOrchestrator] Fire-and-forget failed:', err));
    }

    const modeLabel = modeInfo.qbConnected ? 'QB sync scheduled for high-confidence approval' : 'internal payroll — no QB push needed';

    return {
      mode: modeInfo.mode,
      payrollRunId: result.payrollRunId ?? null,
      employeeCount,
      totalGrossPay: Math.round(totalGross * 100) / 100,
      periodStart,
      periodEnd,
      qbSyncScheduled: modeInfo.qbConnected,
      status: result.payrollRunId ? 'draft' : 'failed',
      summary: `Payroll draft created for ${employeeCount} employee(s) covering ${periodStart} → ${periodEnd}. Estimated gross: $${totalGross.toFixed(2)}. Mode: ${modeLabel}.`,
    };
  } catch (err: any) {
    return {
      mode: modeInfo.mode,
      payrollRunId: null,
      employeeCount: 0,
      totalGrossPay: 0,
      periodStart: periodStartDate! ? periodStartDate.toISOString().split('T')[0] : overrides?.periodStart ?? '',
      periodEnd: periodEndDate! ? periodEndDate.toISOString().split('T')[0] : overrides?.periodEnd ?? '',
      qbSyncScheduled: false,
      status: 'failed',
      summary: `Payroll draft failed: ${(err instanceof Error ? err.message : String(err))}`,
    };
  }
}

// ─── Push to QB ───────────────────────────────────────────────────────────────

async function pushToQuickBooks(workspaceId: string, params: { type: 'invoice' | 'payroll'; id: string }): Promise<{ success: boolean; message: string; qbEntityId?: string }> {
  const modeInfo = await detectFinanceMode(workspaceId);

  if (!modeInfo.qbConnected) {
    return {
      success: false,
      message: `Cannot push to QuickBooks: ${modeInfo.qbStatus === 'expired' ? 'OAuth token has expired — please reconnect QuickBooks.' : 'QuickBooks is not connected for this workspace.'}`,
    };
  }

  if (params.type === 'invoice') {
    try {
      const { syncInvoiceToQuickBooks } = await import('../quickbooksClientBillingSync');
      const result = await syncInvoiceToQuickBooks(params.id);
      return {
        success: result.success,
        message: result.success ? `Invoice synced to QuickBooks successfully.` : `QB sync failed: ${result.error}`,
        qbEntityId: result.qbInvoiceId,
      };
    } catch (e: any) {
      return { success: false, message: `QB invoice push error: ${e.message}` };
    }
  }

  if (params.type === 'payroll') {
    return {
      success: false,
      message: 'Direct payroll push to QuickBooks is handled via the financial pipeline after payroll approval. Approve the payroll run first, then the pipeline will sync.',
    };
  }

  return { success: false, message: 'Unknown entity type. Use "invoice" or "payroll".' };
}

// ─── Reconciliation Report ────────────────────────────────────────────────────

async function buildReconciliationReport(workspaceId: string): Promise<{
  mode: FinanceMode;
  hoursVariance: number;
  revenueVariance: number;
  qbArTotal: number;
  internalOutstanding: number;
  discrepancies: string[];
  recommendations: string[];
}> {
  const modeInfo = await detectFinanceMode(workspaceId);

  const discrepancies: string[] = [];
  const recommendations: string[] = [];

  // Internal outstanding invoices
  const internalOutstanding = await db
    .select({ total: sum(invoices.total) })
    .from(invoices)
    .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.status, 'sent')))
    .then(r => Number(r[0]?.total) || 0);

  let qbArTotal = 0;
  let hoursVariance = 0;
  let revenueVariance = 0;

  if (modeInfo.qbConnected) {
    try {
      const { trinityQuickBooksSnapshotService } = await import('./trinityQuickBooksSnapshot');
      const snap = await trinityQuickBooksSnapshotService.getFinancialSnapshot(workspaceId);

      qbArTotal = snap.arAging.reduce((s: any, b: any) => s + b.totalAmount, 0);
      hoursVariance = snap.hoursReconciliation.variance;
      revenueVariance = qbArTotal - internalOutstanding;

      if (snap.hoursReconciliation.status === 'CRITICAL') {
        discrepancies.push(`CRITICAL: Platform hours vs QB invoiced hours variance is ${snap.hoursReconciliation.variancePercentage.toFixed(1)}% — ${snap.hoursReconciliation.variance.toFixed(1)} hours unaccounted for.`);
        recommendations.push('Run finance.draft_invoices to bill unbilled hours immediately.');
      } else if (snap.hoursReconciliation.status === 'ALERT') {
        discrepancies.push(`ALERT: Hours variance detected — ${snap.hoursReconciliation.variance.toFixed(1)} hours difference between platform and QB invoices.`);
      }

      if (Math.abs(revenueVariance) > 500) {
        discrepancies.push(`Revenue variance: CoAIleague outstanding = $${internalOutstanding.toFixed(2)}, QB AR = $${qbArTotal.toFixed(2)}, delta = $${Math.abs(revenueVariance).toFixed(2)}.`);
        recommendations.push('Audit invoices in the manual review queue to ensure all are synced to QB.');
      }

      if (snap.syncHealth.errorCount > 0) {
        discrepancies.push(`QB sync has ${snap.syncHealth.errorCount} error(s): ${snap.syncHealth.recentErrors.slice(0, 2).join('; ')}`);
        recommendations.push('Check the QB review queue and resolve pending sync errors.');
      }
    } catch (e: any) {
      discrepancies.push(`Could not fetch QB snapshot: ${e.message}`);
    }
  } else {
    recommendations.push('Connect QuickBooks to enable full reconciliation between QB ledger and CoAIleague records.');
  }

  if (discrepancies.length === 0) {
    recommendations.push('No significant discrepancies found. Financial records appear consistent.');
  }

  return {
    mode: modeInfo.mode,
    hoursVariance,
    revenueVariance,
    qbArTotal,
    internalOutstanding,
    discrepancies,
    recommendations,
  };
}

// ─── Action Registration ──────────────────────────────────────────────────────

export function registerFinanceOrchestratorActions(): void {

  const getConnectionStatus: ActionHandler = {
    actionId: 'billing.sync_qb',
    name: 'QuickBooks Sync & Status',
    category: 'billing' as any,
    description: 'Consolidated QB action. Use payload.action: "status" to get QB connection status (default), "push" to push an entity to QB (requires payload.type and payload.id), "prepare" to prepare an invoice QB payload (requires payload.invoiceId).',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = req.workspaceId;
      if (!workspaceId) return fail(req.actionId, 'workspaceId required', null, start);
      const action = req.payload?.action;

      try {
        // action=push → push entity to QB
        if (action === 'push') {
          const { type, id } = req.payload ?? {};
          if (!type || !id) return fail(req.actionId, 'payload.type ("invoice" or "payroll") and payload.id are required', null, start);
          const result = await pushToQuickBooks(workspaceId, { type, id });
          return result.success
            ? ok(req.actionId, result.message, result, start)
            : fail(req.actionId, result.message, result, start);
        }

        // action=prepare → prepare invoice for QB (from bi_prepare_for_qb logic)
        if (action === 'prepare') {
          const { trinityBusinessIntelligence } = await import('./trinityBusinessIntelligence');
          const invoiceId = req.payload?.invoiceId;
          if (!invoiceId) return fail(req.actionId, 'invoiceId required for prepare action', null, start);
          const result = await trinityBusinessIntelligence.analyzeInvoiceForQB(workspaceId, invoiceId);
          return ok(req.actionId,
            `QB payload ready. ${result.formatDecisions.length} intelligent formatting decisions applied. Confidence: ${(result.metacognition.confidence * 100).toFixed(0)}%`,
            result, start);
        }

        // Default: action=status (or no action) → get connection status
        const result = await detectFinanceMode(workspaceId);
        return ok(req.actionId, `Finance mode: ${result.mode}. ${result.recommendation}`, result, start);
      } catch (e: any) {
        return fail(req.actionId, e.message, null, start);
      }
    },
  };

  const gatherSnapshot: ActionHandler = {
    actionId: 'billing.financial_snapshot',
    name: 'Gather Financial Snapshot',
    category: 'billing' as any,
    description: 'Pull complete financial dataset: unbilled work, open payroll period, pending invoices, QB AR aging (if connected), and data quality score.',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = req.workspaceId;
      if (!workspaceId) return fail(req.actionId, 'workspaceId required', null, start);
      try {
        const snapshot = await buildFinancialSnapshot(workspaceId);
        const summary = [
          `Mode: ${snapshot.mode}`,
          `Unbilled: ${snapshot.unbilledWork.clientCount} clients, ${snapshot.unbilledWork.totalUnbilledHours}h, ~$${snapshot.unbilledWork.estimatedRevenue.toFixed(2)}`,
          `Payroll period: ${snapshot.openPayrollPeriod.periodStart?.toISOString().split('T')[0]} → ${snapshot.openPayrollPeriod.periodEnd?.toISOString().split('T')[0]}, ${snapshot.openPayrollPeriod.employeeCount} employees, ~$${snapshot.openPayrollPeriod.estimatedGrossPayroll.toFixed(2)}`,
          `Draft invoices: ${snapshot.pendingInvoices.count} ($${snapshot.pendingInvoices.totalAmount.toFixed(2)})`,
          snapshot.qbSnapshot ? `QB AR: $${snapshot.qbSnapshot.arAgingTotal.toFixed(2)}, ${snapshot.qbSnapshot.overdueCount} overdue, sync: ${snapshot.qbSnapshot.lastSyncAge}` : 'QB: not connected',
          `Data quality: ${snapshot.dataQuality.score}/100${snapshot.dataQuality.warnings.length > 0 ? ' — ' + snapshot.dataQuality.warnings.join('; ') : ''}`,
        ].join('\n');
        return ok(req.actionId, summary, snapshot, start);
      } catch (e: any) {
        return fail(req.actionId, e.message, null, start);
      }
    },
  };

  const draftInvoices: ActionHandler = {
    actionId: 'billing.invoice_generate',
    name: 'Generate Draft Invoices',
    category: 'billing' as any,
    description: 'Generate draft invoices for all clients with approved, unbilled time entries. Auto-detects QB vs internal mode. In QB_MODE, triggers confidence pipeline for potential auto-sync.',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = req.workspaceId;
      const requestedBy = req.userId ?? 'trinity';
      if (!workspaceId) return fail(req.actionId, 'workspaceId required', null, start);
      try {
        const result = await runDraftInvoices(workspaceId, requestedBy);
        return result.drafted > 0
          ? ok(req.actionId, result.summary, result, start)
          : ok(req.actionId, result.summary, result, start);
      } catch (e: any) {
        return fail(req.actionId, e.message, null, start);
      }
    },
  };

  const draftPayroll: ActionHandler = {
    actionId: 'payroll.draft',
    name: 'Draft Payroll Run',
    category: 'billing' as any,
    description: 'Generate a draft payroll run for the current or specified pay period. Auto-detects QB vs internal mode. Uses full internal tax engine (FLSA, OT, state taxes). In QB_MODE, triggers pipeline for QB sync after approval.',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = req.workspaceId;
      const requestedBy = req.userId ?? 'trinity';
      if (!workspaceId) return fail(req.actionId, 'workspaceId required', null, start);
      try {
        const result = await runDraftPayroll(workspaceId, requestedBy, {
          periodStart: req.payload?.periodStart,
          periodEnd: req.payload?.periodEnd,
        });
        return result.status === 'draft'
          ? ok(req.actionId, result.summary, result, start)
          : fail(req.actionId, result.summary, result, start);
      } catch (e: any) {
        return fail(req.actionId, e.message, null, start);
      }
    },
  };

  const pushToQB: ActionHandler = {
    actionId: 'billing.push_to_qb',
    name: 'Push to QuickBooks',
    category: 'billing' as any,
    description: 'Push a specific invoice or payroll run to QuickBooks. Requires QB_MODE (active QB connection). For invoices: direct QBO sync. For payroll: approve the run first, pipeline handles QB sync.',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = req.workspaceId;
      if (!workspaceId) return fail(req.actionId, 'workspaceId required', null, start);
      const { type, id } = req.payload ?? {};
      if (!type || !id) return fail(req.actionId, 'payload.type ("invoice" or "payroll") and payload.id are required', null, start);
      try {
        const result = await pushToQuickBooks(workspaceId, { type, id });
        return result.success
          ? ok(req.actionId, result.message, result, start)
          : fail(req.actionId, result.message, result, start);
      } catch (e: any) {
        return fail(req.actionId, e.message, null, start);
      }
    },
  };

  const reconcile: ActionHandler = {
    actionId: 'billing.reconcile',
    name: 'Reconcile Financial Records',
    category: 'billing' as any,
    description: 'Compare CoAIleague records vs QuickBooks ledger. Surfaces hours variance, revenue gaps, sync errors. In INTERNAL mode, reports on internal record consistency.',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = req.workspaceId;
      if (!workspaceId) return fail(req.actionId, 'workspaceId required', null, start);
      try {
        const report = await buildReconciliationReport(workspaceId);
        const clean = report.discrepancies.length === 0;
        const summary = clean
          ? 'Financial records are consistent. No discrepancies found.'
          : `Found ${report.discrepancies.length} discrepancy/discrepancies: ${report.discrepancies[0]}`;
        return ok(req.actionId, summary, report, start);
      } catch (e: any) {
        return fail(req.actionId, e.message, null, start);
      }
    },
  };

  helpaiOrchestrator.registerAction(getConnectionStatus); // billing.sync_qb (consolidated — replaces qb_connection_status + push_to_qb + bi_prepare_for_qb)
  helpaiOrchestrator.registerAction(gatherSnapshot);     // billing.financial_snapshot (unchanged)
  helpaiOrchestrator.registerAction(draftInvoices);      // billing.invoice_generate (renamed from draft_invoices)
  helpaiOrchestrator.registerAction(draftPayroll);       // payroll.draft (moved from billing.draft_payroll)
  // billing.push_to_qb consolidated into billing.sync_qb above — not registering separately:
  // helpaiOrchestrator.registerAction(pushToQB);
  helpaiOrchestrator.registerAction(reconcile);          // billing.reconcile (unchanged)

  log.info('[Trinity Finance] Registered 5 finance orchestration actions (QB_MODE + INTERNAL dual-mode)');
}
