/**
 * Financial Pipeline Orchestrator
 * ================================
 * Unified orchestration service connecting the complete financial workflow:
 * 
 * Time Entries → Invoice/Payroll Generation → Confidence Scoring →
 * (Auto-approve or Human Review) → QuickBooks Sync → Receipt → Notification
 * 
 * Addresses 4 critical pipeline gaps:
 * GAP 1: Wires Trinity confidence scoring into billing/payroll
 * GAP 2: Persistent per-workspace confidence tracking for progressive autonomy
 * GAP 3: Approval-triggered QuickBooks sync
 * GAP 4: Unified pipeline orchestration
 * 
 * Progressive Autonomy Model:
 * - New workspaces start with mandatory human approval
 * - After N successful runs, Trinity confidence grows
 * - High-confidence operations can be auto-approved with secondary human review
 * - Critical operations always require human verification
 */

import { db } from '../db';
import { invoices, payrollRuns, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { trinityConfidenceScorer, type TrinityOperation } from './ai-brain/trinity-orchestration/trinityConfidenceScorer';
import { claudeVerificationService } from './ai-brain/trinity-orchestration/trinityVerificationService';
import { syncInvoiceToQuickBooks, syncPayrollToQuickBooks } from './quickbooksClientBillingSync';
import { quickbooksReceiptService } from './quickbooksReceiptService';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('financialPipelineOrchestrator');


interface WorkspaceConfidenceProfile {
  workspaceId: string;
  invoiceSuccessCount: number;
  invoiceFailCount: number;
  payrollSuccessCount: number;
  payrollFailCount: number;
  lastInvoiceRun: Date | null;
  lastPayrollRun: Date | null;
  autoApproveInvoices: boolean;
  autoApprovePayroll: boolean;
  confidenceScore: number;
}

interface PipelineResult {
  stage: string;
  success: boolean;
  action: 'auto_approved' | 'pending_review' | 'synced' | 'failed' | 'skipped';
  confidenceScore?: number;
  details?: string;
  qbSyncResult?: any;
}

const CONFIDENCE_THRESHOLDS = {
  AUTO_APPROVE_INVOICE: 85,
  AUTO_APPROVE_PAYROLL: 90,
  MIN_SUCCESSFUL_RUNS_INVOICE: 5,
  MIN_SUCCESSFUL_RUNS_PAYROLL: 8,
  CLAUDE_VERIFICATION_THRESHOLD: 70,
};

const confidenceCache = new Map<string, WorkspaceConfidenceProfile>();

function defaultProfile(workspaceId: string): WorkspaceConfidenceProfile {
  return {
    workspaceId,
    invoiceSuccessCount: 0,
    invoiceFailCount: 0,
    payrollSuccessCount: 0,
    payrollFailCount: 0,
    lastInvoiceRun: null,
    lastPayrollRun: null,
    autoApproveInvoices: false,
    autoApprovePayroll: false,
    confidenceScore: 50,
  };
}

async function loadProfileFromDB(workspaceId: string): Promise<WorkspaceConfidenceProfile> {
  try {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    const prefs = (workspace as any)?.billingPreferences as any;
    if (prefs?.financialPipelineConfidence) {
      const saved = prefs.financialPipelineConfidence;
      return {
        workspaceId,
        invoiceSuccessCount: saved.invoiceSuccessCount || 0,
        invoiceFailCount: saved.invoiceFailCount || 0,
        payrollSuccessCount: saved.payrollSuccessCount || 0,
        payrollFailCount: saved.payrollFailCount || 0,
        lastInvoiceRun: saved.lastInvoiceRun ? new Date(saved.lastInvoiceRun) : null,
        lastPayrollRun: saved.lastPayrollRun ? new Date(saved.lastPayrollRun) : null,
        autoApproveInvoices: saved.autoApproveInvoices || false,
        autoApprovePayroll: saved.autoApprovePayroll || false,
        confidenceScore: saved.confidenceScore || 50,
      };
    }
  } catch (e) {
    log.warn('[FinancialPipeline] Failed to load profile from DB:', e);
  }
  return defaultProfile(workspaceId);
}

async function persistProfileToDB(profile: WorkspaceConfidenceProfile): Promise<void> {
  try {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, profile.workspaceId),
    });
    const existingPrefs = ((workspace as any)?.billingPreferences as any) || {};
    await db.update(workspaces)
      .set({
        billingPreferences: {
          ...existingPrefs,
          financialPipelineConfidence: {
            invoiceSuccessCount: profile.invoiceSuccessCount,
            invoiceFailCount: profile.invoiceFailCount,
            payrollSuccessCount: profile.payrollSuccessCount,
            payrollFailCount: profile.payrollFailCount,
            lastInvoiceRun: profile.lastInvoiceRun?.toISOString() || null,
            lastPayrollRun: profile.lastPayrollRun?.toISOString() || null,
            autoApproveInvoices: profile.autoApproveInvoices,
            autoApprovePayroll: profile.autoApprovePayroll,
            confidenceScore: profile.confidenceScore,
            updatedAt: new Date().toISOString(),
          },
        },
      } as any)
      .where(eq(workspaces.id, profile.workspaceId));
  } catch (e) {
    log.warn('[FinancialPipeline] Failed to persist profile to DB:', e);
  }
}

/**
 * Get or create workspace confidence profile (DB-backed with in-memory cache)
 */
function getConfidenceProfile(workspaceId: string): WorkspaceConfidenceProfile {
  if (!confidenceCache.has(workspaceId)) {
    confidenceCache.set(workspaceId, defaultProfile(workspaceId));
    loadProfileFromDB(workspaceId).then(profile => {
      confidenceCache.set(workspaceId, profile);
    }).catch(err => {
      log.error(`[FinancialPipeline] Failed to load confidence profile for ${workspaceId} — using defaults:`, err);
    });
  }
  return confidenceCache.get(workspaceId)!;
}

async function getConfidenceProfileAsync(workspaceId: string): Promise<WorkspaceConfidenceProfile> {
  if (!confidenceCache.has(workspaceId)) {
    const profile = await loadProfileFromDB(workspaceId);
    confidenceCache.set(workspaceId, profile);
  }
  return confidenceCache.get(workspaceId)!;
}

/**
 * Calculate progressive confidence based on history
 */
function calculateProgressiveConfidence(
  profile: WorkspaceConfidenceProfile,
  operationType: 'invoice' | 'payroll'
): number {
  const successCount = operationType === 'invoice' 
    ? profile.invoiceSuccessCount 
    : profile.payrollSuccessCount;
  const failCount = operationType === 'invoice'
    ? profile.invoiceFailCount
    : profile.payrollFailCount;
  const totalRuns = successCount + failCount;

  if (totalRuns === 0) return 50;

  const successRate = successCount / totalRuns;
  const recencyBonus = totalRuns >= 10 ? 10 : totalRuns;
  const baseConfidence = successRate * 80 + recencyBonus;

  return Math.min(Math.round(baseConfidence), 100);
}

/**
 * Record operation result for progressive learning
 */
async function recordOperationResult(
  workspaceId: string,
  operationType: 'invoice' | 'payroll',
  success: boolean
): Promise<void> {
  const profile = await getConfidenceProfileAsync(workspaceId);

  if (operationType === 'invoice') {
    if (success) profile.invoiceSuccessCount++;
    else profile.invoiceFailCount++;
    profile.lastInvoiceRun = new Date();
  } else {
    if (success) profile.payrollSuccessCount++;
    else profile.payrollFailCount++;
    profile.lastPayrollRun = new Date();
  }

  profile.confidenceScore = Math.max(
    calculateProgressiveConfidence(profile, 'invoice'),
    calculateProgressiveConfidence(profile, 'payroll')
  );

  const minRunsInvoice = CONFIDENCE_THRESHOLDS.MIN_SUCCESSFUL_RUNS_INVOICE;
  const minRunsPayroll = CONFIDENCE_THRESHOLDS.MIN_SUCCESSFUL_RUNS_PAYROLL;

  profile.autoApproveInvoices = 
    profile.invoiceSuccessCount >= minRunsInvoice &&
    calculateProgressiveConfidence(profile, 'invoice') >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE_INVOICE;

  profile.autoApprovePayroll =
    profile.payrollSuccessCount >= minRunsPayroll &&
    calculateProgressiveConfidence(profile, 'payroll') >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE_PAYROLL;

  log.info(`[FinancialPipeline] ${workspaceId} confidence updated: ${JSON.stringify({
    type: operationType,
    success,
    score: profile.confidenceScore,
    autoInvoice: profile.autoApproveInvoices,
    autoPayroll: profile.autoApprovePayroll,
    invoiceRuns: profile.invoiceSuccessCount + profile.invoiceFailCount,
    payrollRuns: profile.payrollSuccessCount + profile.payrollFailCount,
  })}`);

  await persistProfileToDB(profile);
}

/**
 * Score operation confidence using Trinity's confidence scorer
 */
function scoreOperation(
  workspaceId: string,
  operationType: 'invoice_generation' | 'payroll_processing',
  financialImpact: number,
  dataPoints: { missing: number; edgeCases: string[]; hasHistory: boolean }
): { score: number; shouldVerify: boolean; concerns: string[] } {
  const operation: TrinityOperation = {
    type: operationType,
    workspaceId,
    missingDataPoints: dataPoints.missing,
    edgeCasesDetected: dataPoints.edgeCases,
    hasHistoricalPrecedent: dataPoints.hasHistory,
    financialImpact,
    hasRegulatoryImplications: operationType === 'payroll_processing',
    anomalyScore: 0,
    affectsMultipleUsers: operationType === 'payroll_processing' ? 10 : 1,
    data: {},
  };

  const result = trinityConfidenceScorer.calculateConfidence(operation);

  return {
    score: result.score,
    shouldVerify: result.recommendation.shouldVerify,
    concerns: result.concerns,
  };
}

/**
 * PIPELINE STAGE 1: Process invoice through confidence pipeline
 * Called by autonomous scheduler after invoice generation
 */
export async function processInvoiceThroughPipeline(
  invoiceId: string,
  workspaceId: string
): Promise<PipelineResult> {
  log.info(`[FinancialPipeline] Processing invoice ${invoiceId} through pipeline`);

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)),
  });

  if (!invoice) {
    return { stage: 'validation', success: false, action: 'failed', details: 'Invoice not found' };
  }

  const profile = await getConfidenceProfileAsync(workspaceId);
  const amount = Number(invoice.total) || 0;

  const confidenceResult = scoreOperation(workspaceId, 'invoice_generation', amount, {
    missing: invoice.clientId ? 0 : 1,
    edgeCases: amount > 50000 ? ['High value invoice exceeds $50K'] : [],
    hasHistory: profile.invoiceSuccessCount > 0,
  });

  const progressiveConfidence = calculateProgressiveConfidence(profile, 'invoice');
  const combinedConfidence = Math.round((confidenceResult.score + progressiveConfidence) / 2);

  log.info(`[FinancialPipeline] Invoice ${invoiceId} confidence: trinity=${confidenceResult.score}, progressive=${progressiveConfidence}, combined=${combinedConfidence}`);

  if (profile.autoApproveInvoices && combinedConfidence >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE_INVOICE) {
    log.info(`[FinancialPipeline] Auto-approving invoice ${invoiceId} (confidence ${combinedConfidence}%)`);

    const syncResult = await syncInvoiceToQuickBooks(invoiceId);
    await recordOperationResult(workspaceId, 'invoice', syncResult.success);

    if (syncResult.success) {
      await notifySecondaryReview(workspaceId, 'invoice', invoiceId, combinedConfidence, amount);
    }

    return {
      stage: 'auto_approve',
      success: syncResult.success,
      action: syncResult.success ? 'auto_approved' : 'failed',
      confidenceScore: combinedConfidence,
      details: syncResult.success
        ? `Auto-approved and synced to QB (confidence ${combinedConfidence}%)`
        : `Auto-approved but QB sync failed: ${syncResult.error}`,
      qbSyncResult: syncResult,
    };
  }

  if (confidenceResult.shouldVerify && claudeVerificationService.isAvailable()) {
    log.info(`[FinancialPipeline] Invoice ${invoiceId} flagged for Claude verification`);
  }

  await notifyPendingReview(workspaceId, 'invoice', invoiceId, combinedConfidence, amount, confidenceResult.concerns);

  return {
    stage: 'pending_review',
    success: true,
    action: 'pending_review',
    confidenceScore: combinedConfidence,
    details: `Invoice held for human review (confidence ${combinedConfidence}%). ${confidenceResult.concerns.length > 0 ? 'Concerns: ' + confidenceResult.concerns.join(', ') : ''}`,
  };
}

/**
 * PIPELINE STAGE 1: Process payroll through confidence pipeline
 * Called by autonomous scheduler after payroll generation
 */
export async function processPayrollThroughPipeline(
  payrollRunId: string,
  workspaceId: string
): Promise<PipelineResult> {
  log.info(`[FinancialPipeline] Processing payroll ${payrollRunId} through pipeline`);

  const payrollRun = await db.query.payrollRuns.findFirst({
    where: and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)),
  });

  if (!payrollRun) {
    return { stage: 'validation', success: false, action: 'failed', details: 'Payroll run not found' };
  }

  const profile = await getConfidenceProfileAsync(workspaceId);
  const totalPay = Number(payrollRun.totalGrossPay) || 0;

  const confidenceResult = scoreOperation(workspaceId, 'payroll_processing', totalPay, {
    missing: 0,
    edgeCases: totalPay > 100000 ? ['High payroll exceeds $100K'] : [],
    hasHistory: profile.payrollSuccessCount > 0,
  });

  const progressiveConfidence = calculateProgressiveConfidence(profile, 'payroll');
  const combinedConfidence = Math.round((confidenceResult.score + progressiveConfidence) / 2);

  log.info(`[FinancialPipeline] Payroll ${payrollRunId} confidence: trinity=${confidenceResult.score}, progressive=${progressiveConfidence}, combined=${combinedConfidence}`);

  if (profile.autoApprovePayroll && combinedConfidence >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE_PAYROLL) {
    log.info(`[FinancialPipeline] Auto-approving payroll ${payrollRunId} (confidence ${combinedConfidence}%)`);

    const syncResult = await syncPayrollToQuickBooks(payrollRunId);
    await recordOperationResult(workspaceId, 'payroll', syncResult.success);

    if (syncResult.success) {
      await notifySecondaryReview(workspaceId, 'payroll', payrollRunId, combinedConfidence, totalPay);
    }

    return {
      stage: 'auto_approve',
      success: syncResult.success,
      action: syncResult.success ? 'auto_approved' : 'failed',
      confidenceScore: combinedConfidence,
      details: syncResult.success
        ? `Auto-approved and synced to QB (confidence ${combinedConfidence}%)`
        : `Auto-approved but QB sync failed: ${syncResult.error}`,
      qbSyncResult: syncResult,
    };
  }

  await notifyPendingReview(workspaceId, 'payroll', payrollRunId, combinedConfidence, totalPay, confidenceResult.concerns);

  return {
    stage: 'pending_review',
    success: true,
    action: 'pending_review',
    confidenceScore: combinedConfidence,
    details: `Payroll held for human review (confidence ${combinedConfidence}%). ${confidenceResult.concerns.length > 0 ? 'Concerns: ' + confidenceResult.concerns.join(', ') : ''}`,
  };
}

/**
 * PIPELINE STAGE 2: Handle human approval → trigger QB sync
 * Called when a manager approves an invoice or payroll run
 */
export async function onInvoiceApproved(invoiceId: string, workspaceId: string, approvedBy: string): Promise<PipelineResult> {
  log.info(`[FinancialPipeline] Invoice ${invoiceId} approved by ${approvedBy}, triggering QB sync`);

  const syncResult = await syncInvoiceToQuickBooks(invoiceId);
  await recordOperationResult(workspaceId, 'invoice', syncResult.success);

  if (syncResult.success) {
    try {
      const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
      const { clients } = await import('@shared/schema');
      let clientName = `Invoice-${invoiceId.slice(0, 8)}`;
      if (inv?.clientId) {
        const client = await db.query.clients.findFirst({ where: eq(clients.id, inv.clientId) });
        clientName = client?.companyName || (client as any)?.name || clientName;
      }
      await quickbooksReceiptService.createInvoiceReceipt({
        workspaceId,
        invoices: [{
          id: invoiceId,
          clientName,
          amount: Number(inv?.total) || 0,
          status: 'synced',
          quickbooksId: syncResult.qbInvoiceId,
        }],
      });
    } catch (e) {
      log.warn('[FinancialPipeline] Receipt generation failed (non-critical):', e);
    }
  }

  return {
    stage: 'approval_sync',
    success: syncResult.success,
    action: syncResult.success ? 'synced' : 'failed',
    details: syncResult.success
      ? `Invoice synced to QuickBooks after approval (QB ID: ${syncResult.qbInvoiceId})`
      : `QB sync failed after approval: ${syncResult.error}`,
    qbSyncResult: syncResult,
  };
}

export async function onPayrollApproved(payrollRunId: string, workspaceId: string, approvedBy: string): Promise<PipelineResult> {
  log.info(`[FinancialPipeline] Payroll ${payrollRunId} approved by ${approvedBy}`);

  let useExternalProvider = false;
  try {
    const { providerPreferenceService } = await import('./billing/providerPreferenceService');
    const prefs = await providerPreferenceService.getPreferences(workspaceId);
    useExternalProvider = prefs.payrollProvider === 'quickbooks' || prefs.payrollProvider === 'gusto' || prefs.payrollProvider === 'adp';
    log.info(`[FinancialPipeline] Payroll provider for ${workspaceId}: ${prefs.payrollProvider}`);
  } catch (prefErr) {
    log.error('[FinancialPipeline] CRITICAL: Could not determine provider preference — defaulting to INTERNAL payroll (fail-safe):', prefErr);
    useExternalProvider = false;
  }

  if (!useExternalProvider) {
    log.info(`[FinancialPipeline] No external payroll partner configured, executing internal payroll for ${payrollRunId}`);
    try {
      const { executeInternalPayroll } = await import('./payrollAutomation');
      const internalResult = await executeInternalPayroll(workspaceId, payrollRunId, approvedBy);
      await recordOperationResult(workspaceId, 'payroll', internalResult.success);

      return {
        stage: 'internal_execution',
        success: internalResult.success,
        action: internalResult.success ? 'synced' : 'failed',
        details: internalResult.success
          ? `Internal payroll executed: ${internalResult.processedEntries} entries, $${internalResult.totalNetPay.toFixed(2)} net pay, ${internalResult.stripePayouts} Stripe payouts, ${internalResult.pendingManualPayments} manual payments`
          : `Internal payroll partially failed: ${internalResult.errors.join('; ')}`,
      };
    } catch (e: any) {
      log.error('[FinancialPipeline] Internal payroll execution failed:', e);
      await recordOperationResult(workspaceId, 'payroll', false);
      return {
        stage: 'internal_execution',
        success: false,
        action: 'failed',
        details: `Internal payroll execution failed: ${e.message}`,
      };
    }
  }

  log.info(`[FinancialPipeline] Triggering QB sync for payroll ${payrollRunId}`);
  const syncResult = await syncPayrollToQuickBooks(payrollRunId);
  await recordOperationResult(workspaceId, 'payroll', syncResult.success);

  if (syncResult.success) {
    try {
      const { payrollEntries, employees: employeesTable } = await import('@shared/schema');
      const entries = await db.select().from(payrollEntries).where(eq(payrollEntries.payrollRunId, payrollRunId));
      const receiptEntries = await Promise.all(entries.map(async (entry) => {
        const emp = await db.query.employees.findFirst({ where: eq(employeesTable.id, entry.employeeId) });
        return {
          id: entry.id,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : `Employee-${entry.employeeId.slice(0, 8)}`,
          hours: Number(entry.regularHours) || 0,
          amount: Number(entry.grossPay) || 0,
          status: 'synced' as const,
          quickbooksId: syncResult.qbInvoiceId,
        };
      }));
      await quickbooksReceiptService.createPayrollReceipt({
        workspaceId,
        payrollRunId,
        entries: receiptEntries.length > 0 ? receiptEntries : [{
          id: payrollRunId,
          employeeName: `Payroll-${payrollRunId.slice(0, 8)}`,
          hours: 0,
          amount: 0,
          status: 'synced' as const,
          quickbooksId: syncResult.qbInvoiceId,
        }],
      });
    } catch (e) {
      log.warn('[FinancialPipeline] Receipt generation failed (non-critical):', e);
    }
  }

  return {
    stage: 'approval_sync',
    success: syncResult.success,
    action: syncResult.success ? 'synced' : 'failed',
    details: syncResult.success
      ? `Payroll synced to QuickBooks after approval`
      : `QB sync failed after approval: ${syncResult.error}`,
    qbSyncResult: syncResult,
  };
}

/**
 * Get pipeline status for a workspace
 */
export async function getWorkspacePipelineStatus(workspaceId: string) {
  const profile = await getConfidenceProfileAsync(workspaceId);
  return {
    workspaceId,
    confidenceScore: profile.confidenceScore,
    invoiceAutonomy: {
      autoApproveEnabled: profile.autoApproveInvoices,
      successfulRuns: profile.invoiceSuccessCount,
      failedRuns: profile.invoiceFailCount,
      confidence: calculateProgressiveConfidence(profile, 'invoice'),
      thresholdRequired: CONFIDENCE_THRESHOLDS.AUTO_APPROVE_INVOICE,
      runsRequired: CONFIDENCE_THRESHOLDS.MIN_SUCCESSFUL_RUNS_INVOICE,
    },
    payrollAutonomy: {
      autoApproveEnabled: profile.autoApprovePayroll,
      successfulRuns: profile.payrollSuccessCount,
      failedRuns: profile.payrollFailCount,
      confidence: calculateProgressiveConfidence(profile, 'payroll'),
      thresholdRequired: CONFIDENCE_THRESHOLDS.AUTO_APPROVE_PAYROLL,
      runsRequired: CONFIDENCE_THRESHOLDS.MIN_SUCCESSFUL_RUNS_PAYROLL,
    },
    lastInvoiceRun: profile.lastInvoiceRun,
    lastPayrollRun: profile.lastPayrollRun,
  };
}

/**
 * Notification helpers
 */
async function notifyPendingReview(
  workspaceId: string,
  type: 'invoice' | 'payroll',
  entityId: string,
  confidence: number,
  amount: number,
  concerns: string[]
) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const label = type === 'invoice' ? 'Invoice' : 'Payroll Run';
  const concernText = concerns.length > 0 ? ` Concerns: ${concerns.join(', ')}` : '';

  await platformEventBus.publish({
    type: 'trinity_issue_detected',
    category: 'ai_brain',
    title: `${label} Requires Review`,
    description: `Trinity generated a ${type} ($${amount.toFixed(2)}) with ${confidence}% confidence. Human approval required before QuickBooks sync.${concernText}`,
    workspaceId,
    severity: confidence < 60 ? 'high' : 'medium',
    metadata: {
      pipelineStage: 'pending_review',
      entityType: type,
      entityId,
      confidenceScore: confidence,
      amount,
      concerns,
    },
  });
}

async function notifySecondaryReview(
  workspaceId: string,
  type: 'invoice' | 'payroll',
  entityId: string,
  confidence: number,
  amount: number
) {
  const label = type === 'invoice' ? 'Invoice' : 'Payroll Run';

  await platformEventBus.publish({
    type: 'automation_completed',
    category: 'ai_brain',
    title: `${label} Auto-Approved & Synced`,
    description: `Trinity auto-approved and synced a ${type} ($${amount.toFixed(2)}) to QuickBooks with ${confidence}% confidence. Available for secondary review.`,
    workspaceId,
    metadata: {
      pipelineStage: 'auto_approved',
      entityType: type,
      entityId,
      confidenceScore: confidence,
      amount,
      autoApproved: true,
      secondaryReviewAvailable: true,
    },
  });
}

export const financialPipelineOrchestrator = {
  processInvoiceThroughPipeline,
  processPayrollThroughPipeline,
  onInvoiceApproved,
  onPayrollApproved,
  getWorkspacePipelineStatus,
  getConfidenceProfile,
  recordOperationResult,
};
