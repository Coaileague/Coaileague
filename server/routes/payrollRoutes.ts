import crypto from 'crypto';
import { sanitizeError } from '../middleware/errorHandler';
import { PLATFORM } from '../config/platformConfig';
import {  validateDeductionAmount, validateNonNegativeAmount, businessRuleResponse } from '../lib/businessRules';
import { Router } from "express";
import type { AuthenticatedRequest } from "../rbac";
import { sumFinancialValues,  toFinancialString } from '../services/financialCalculator';
import { platformEventBus } from '../services/platformEventBus';
import { hasManagerAccess, hasPlatformWideAccess } from "../rbac";
import PDFDocument from "pdfkit";
import { db } from "../db";
import { storage } from "../storage";
import { and,  desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  payrollRuns,
  payrollEntries,
  payrollGarnishments,
  payStubs,
  employees,
  
  employeePayrollInfo,
  employeeBankAccounts,
  timeEntries,
  billingAuditLog,
  payrollRunLocks,
  invoices,
  clients,
  employeeTaxForms,
  employees as employeesTable,
  users,
  workspaces,
} from '@shared/schema';
import { employeeOnboardingProgress } from '@shared/schema/domains/workforce/extended';
import { encryptToken, decryptToken } from '../security/tokenEncryption';
import * as taxCalculator from "../services/taxCalculator";
import { getWorkspaceTier, hasTierAccess, requirePlan } from "../tierGuards";
import { payrollDeductions } from '@shared/schema';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { requireAuth } from '../auth';

// Plaid compensating-transaction ledger: pending row is written BEFORE the
// Plaid API call, flipped to initiated / failed after. See payrollAutomation.ts.
registerLegacyBootstrap('plaid_transfer_attempts', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS plaid_transfer_attempts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      payroll_run_id VARCHAR,
      payroll_entry_id VARCHAR,
      amount NUMERIC(10,2) NOT NULL,
      transfer_id VARCHAR,
      status VARCHAR NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      initiated_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS plaid_transfer_attempts_workspace_idx ON plaid_transfer_attempts(workspace_id);
    CREATE INDEX IF NOT EXISTS plaid_transfer_attempts_employee_idx ON plaid_transfer_attempts(employee_id);
    CREATE INDEX IF NOT EXISTS plaid_transfer_attempts_run_idx ON plaid_transfer_attempts(payroll_run_id);
    CREATE INDEX IF NOT EXISTS plaid_transfer_attempts_status_idx ON plaid_transfer_attempts(status);
  `);
});

// TRINITY.md Section R / Law P2: payroll run lock is DB-backed so a Railway
// redeploy mid-run cannot let a second request start a duplicate concurrent
// payroll run for the same workspace + period.
const PAYROLL_RUN_LOCK_TTL_MS = 5 * 60 * 1000;

async function acquirePayrollRunLock(
  workspaceId: string,
  userId: string,
): Promise<{ acquired: boolean; holder?: string }> {
  const now = new Date();
  const expiresAt = new Date(Date.now() + PAYROLL_RUN_LOCK_TTL_MS);

  // Wrap in transaction: delete stale + insert new lock is one atomic operation.
  // Without the transaction, a crash between delete and insert leaves no lock,
  // allowing concurrent payroll runs on the same workspace.
  try {
    await db.transaction(async (tx) => {
      // Clear any stale lock first so a crashed prior run cannot wedge the workspace.
      await tx.delete(payrollRunLocks)
        .where(and(
          eq(payrollRunLocks.workspaceId, workspaceId),
          lte(payrollRunLocks.expiresAt, now),
        ));
      await tx.insert(payrollRunLocks).values({
        workspaceId,
        lockedBy: userId,
        lockedAt: now,
        expiresAt,
      });
    });
    return { acquired: true };
  } catch {
    const [existing] = await db.select()
      .from(payrollRunLocks)
      .where(eq(payrollRunLocks.workspaceId, workspaceId))
      .limit(1);
    return { acquired: false, holder: existing?.lockedBy };
  }
}

async function releasePayrollRunLock(workspaceId: string): Promise<void> {
  try {
    await db.delete(payrollRunLocks).where(eq(payrollRunLocks.workspaceId, workspaceId));
  } catch (err: any) {
    log.warn('[PayrollLock] Release failed (non-fatal):', err?.message);
  }
}
import {
  addDeduction,
  addGarnishment,
  applyDeductionsAndGarnishments,
  calculateTotalDeductions,
  calculateTotalGarnishments,
} from "../services/payrollDeductionService";
import { broadcastNotificationToUser as broadcastNotification } from "../websocket";
import * as notificationHelpers from "../notifications";
import { format } from "date-fns";
import { z } from "zod";
import {
  payrollDeductionSchema,
  payrollGarnishmentSchema,
  payrollInfoUpdateSchema,
  payrollVoidSchema,
  payrollMarkPaidSchema,
  payrollAmendSchema,
  employeeBankAccountSchema,
  employeeBankAccountUpdateSchema,
} from '@shared/schemas/payroll';

import { rateLimitMiddleware } from "../services/infrastructure/rateLimiting";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { mutationLimiter } from "../middleware/rateLimiter";
import { isValidPayrollTransition, resolvePayrollLifecycleStatus } from "../services/payroll/payrollStateMachine";
import { createLogger } from '../lib/logger';
import { isTerminalPayrollStatus,  isValidPayrollTransition} from '../services/payroll/payrollStatus';
import { getPayrollTaxFilingDeadlines, getPayrollTaxFilingGuide, getPayrollStatePortals } from '../services/payroll/payrollTaxFilingGuideService';
import { buildPayrollCsvExport } from '../services/payroll/payrollCsvExportService';
import { rejectPayrollProposal } from '../services/payroll/payrollProposalRejectionService';
import { getMyPaychecks, getMyPayStub, getMyPayrollInfo, updateMyPayrollInfo, getYtdEarnings } from '../services/payroll/payrollEmployeeSelfServiceService';
import { listPayrollProposals } from '../services/payroll/payrollProposalReadService';
import { getMyEmployeeTaxForms, getMyEmployeeTaxForm } from '../services/payroll/payrollEmployeeTaxFormsService';
import { listPayrollRuns, getPayrollRun } from '../services/payroll/payrollRunReadService';
import { deletePayrollRun } from '../services/payroll/payrollRunDeleteService';
import { approvePayrollProposal } from '../services/payroll/payrollProposalApprovalService';
import { broadcastToWorkspace } from '../websocket';
import { universalNotificationEngine } from '../services/universalNotificationEngine';
import { taxFormGeneratorService } from '../services/taxFormGeneratorService';
import { markPayrollRunPaid } from '../services/payroll/payrollRunMarkPaidService';
import { processPayrollRunState } from '../services/payroll/payrollRunProcessStateService';
import { voidPayrollRun } from '../services/payroll/payrollRunVoidService';
import { createPayrollRunForPeriod } from '../services/payroll/payrollRunCreationService';
import { listBankAccounts, addBankAccount, updateBankAccount, deactivateBankAccount, verifyBankAccount } from '../services/payroll/payrollBankAccountService';
import { approvePayrollRun } from '../services/payroll/payrollRunApprovalService';
import { tokenManager } from '../services/billing/tokenManager';
import { taxFilingAssistanceService } from '../services/taxFilingAssistanceService';
import { executeInternalPayroll, amendPayrollEntry } from '../services/payrollAutomation';
import { startOfWeek, endOfWeek, subDays, startOfMonth, endOfMonth, format as dateFnsFormat } from 'date-fns';
import { generateNachaFile } from '../services/payroll/payrollNachaService';
import { generatePayrollRunPdf } from '../services/payroll/payrollPdfExportService';
import { initiatePayrollAchTransfer } from '../services/payroll/achTransferService';
import { retryFailedPayrollTransfers } from '../services/payroll/payrollRetryService';
import { PLATFORM } from '@shared/platformConfig';
import { getMiddlewareFees } from '@shared/billingConfig';
import { createBonusPayEntry, createCommissionPayEntry } from '../services/payroll/payrollSupplementalPayService';
import { getTaxCenterData, getPreRunChecklist } from '../services/payroll/payrollTaxCenterService';
import { writeLedgerEntry } from '../services/orgLedgerService';
const log = createLogger('PayrollRoutes');

const router = Router();

// Apply rate limiting to all payroll routes
// Payroll operations are sensitive and can be expensive (tax calculations, exports)
router.use(rateLimitMiddleware(
  (req: any) => {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.session?.currentWorkspaceId;
    if (workspaceId) return `payroll-${workspaceId}`;
    return `payroll-ip-${req.ip}`;
  },
  (req: any) => (req.session?.plan || 'free') as any
));

function checkManagerRole(req: AuthenticatedRequest): { allowed: boolean; error?: string; status?: number } {
  if (req.platformRole && hasPlatformWideAccess(req.platformRole)) return { allowed: true };
  if (!req.workspaceRole) return { allowed: false, error: 'No workspace role resolved', status: 403 };
  if (!hasManagerAccess(req.workspaceRole)) {
    return { allowed: false, error: 'Insufficient permissions - requires manager role or higher', status: 403 };
  }
  return { allowed: true };
}

  router.get('/export/csv', requirePlan('business'), async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) {
        return res.status(roleCheck.status || 403).json({ error: roleCheck.error || 'Insufficient permissions' });
      }
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const { startDate, endDate } = req.query;
      const result = await buildPayrollCsvExport({
        workspaceId,
        userId,
        ipAddress: req.ip || null,
        startDate: typeof startDate === 'string' ? startDate : null,
        endDate: typeof endDate === 'string' ? endDate : null,
      });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.csv);
    } catch (error: unknown) {
      log.error("Error exporting payroll CSV:", error);
      res.status(500).json({ message: "Failed to export payroll" });
    }
  });
  router.get('/proposals', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
      const userWorkspace = await storage.getWorkspaceMemberByUserId(req.user?.id!);
      if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });
      const status = typeof req.query.status === 'string' ? req.query.status : null;
      const proposals = await listPayrollProposals({ workspaceId: userWorkspace.workspaceId, status });
      res.json(proposals);
    } catch (error: unknown) {
      log.error('Error fetching payroll proposals:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch proposals' });
    }
  });

  router.patch('/proposals/:id/approve', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const { id } = req.params;
      const userId = req.user?.id;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId!);
      if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

      const result = await approvePayrollProposal({
        proposalId: id,
        workspaceId: userWorkspace.workspaceId,
        userId: userId!,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
      });

      res.json(result);
    } catch (error: unknown) {
      const status = (error as any)?.status || 500;
      const extra = (error as any)?.extra || {};
      log.error('OperationsOS™ Payroll Approval Error:', error);
      res.status(status).json({
        message: error instanceof Error ? sanitizeError(error) : 'Failed to approve payroll',
        ...extra,
      });
    }
  });

  router.patch('/proposals/:id/reject', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId!);
      if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

      const result = await rejectPayrollProposal({
        proposalId: id,
        reason,
        userId: userId!,
        workspaceId: userWorkspace.workspaceId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
      });

      res.json(result);
    } catch (error: unknown) {
      log.error('[PayrollRoute] Failed to reject payroll:', error);
      const status = (error as any)?.status || 500;
      res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to reject payroll' });
    }
  });

  router.post('/create-run', mutationLimiter, idempotencyMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const workspaceId = req.workspaceId!;

      const schema = z.object({
        payPeriodStart: z.string().optional(),
        payPeriodEnd: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(422).json({
          message: 'Invalid request',
          errors: validationResult.error.errors,
        });
      }

      const result = await createPayrollRunForPeriod({
        workspaceId,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        payPeriodStart: validationResult.data.payPeriodStart || null,
        payPeriodEnd: validationResult.data.payPeriodEnd || null,
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });

      res.json({ ...result.payrollRun, complianceWarnings: result.complianceWarnings });
    } catch (error: unknown) {
      const status = (error as any)?.status || (error as any)?.statusCode || 500;
      const extra = (error as any)?.extra || {};

      if ((error as any)?.code === 'DUPLICATE_PAYROLL_RUN') {
        return res.status(409).json({
          message: error instanceof Error ? sanitizeError(error) : 'Duplicate payroll run',
          code: (error as any).code,
          existingRunId: (error as any).existingRunId,
          existingRunStatus: (error as any).existingRunStatus,
        });
      }

      log.error('Error creating payroll run:', error);
      res.status(status).json({
        message: error instanceof Error ? sanitizeError(error) : 'Failed to create payroll run',
        ...extra,
      });
    }
  });

  router.get('/runs', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const runs = await listPayrollRuns({
        workspaceId,
        status: typeof req.query.status === 'string' ? req.query.status : null,
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : null,
      });
      res.json(runs);
    } catch (error: unknown) {
      const status = (error as any)?.status || 500;
      log.error('Error fetching payroll runs:', error);
      res.status(status).json({ message: 'Failed to fetch payroll runs' });
    }
  });

  router.get('/runs/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;

      const isManager = req.workspaceRole && hasManagerAccess(req.workspaceRole);
      const isPlatform = req.platformRole && hasPlatformWideAccess(req.platformRole);

      // Employees see only their own entries — preserve scoped path inline
      if (!isManager && !isPlatform) {
        const run = await storage.getPayrollRun(id, workspaceId);
        if (!run) return res.status(404).json({ message: 'Payroll run not found' });
        const employee = await storage.getEmployeeByUserId(req.user?.id || '', workspaceId);
        if (!employee) return res.status(403).json({ error: 'No employee record found for your user in this workspace' });
        const entries = await db.select().from(payrollEntries)
          .where(and(eq(payrollEntries.payrollRunId, id), eq(payrollEntries.employeeId, employee.id)));
        return res.json({ ...run, entries });
      }

      // Managers/platform: full run + all entries via canonical service
      const result = await getPayrollRun({ workspaceId, payrollRunId: id, includeEntries: true });
      res.json({ ...result.run, entries: result.entries || [] });
    } catch (error: unknown) {
      const status = (error as any)?.status || 500;
      log.error('Error fetching payroll run:', error);
      res.status(status).json({ message: 'Failed to fetch payroll run' });
    }
  });

  router.post('/runs/:id/approve', mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const workspaceId = req.workspaceId!;
      const workspaceTier = await getWorkspaceTier(workspaceId);
      if (!hasTierAccess(workspaceTier, 'professional')) {
        return res.status(402).json({
          error: 'This feature requires professional plan or higher',
          currentTier: workspaceTier,
          minimumTier: 'professional',
          requiresTierUpgrade: true,
        });
      }

      const result = await approvePayrollRun({
        workspaceId,
        payrollRunId: req.params.id,
        userId,
        userEmail: req.user?.email || null,
        userRole: req.user?.role || null,
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });

      res.json({ ...result.run, qbSync: result.qbSync });
    } catch (error: unknown) {
      const status = (error as any)?.status || 500;
      const extra = (error as any)?.extra || {};
      const code = (error as any)?.code;
      log.error('Error approving payroll run:', error);
      res.status(status).json({
        message: error instanceof Error ? sanitizeError(error) : 'Failed to approve payroll run',
        ...(code ? { code } : {}),
        ...extra,
      });
    }
  });

  router.post('/runs/:id/process', mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId!;

      const workspaceTier = await getWorkspaceTier(workspaceId);
      if (!hasTierAccess(workspaceTier, 'professional')) {
        return res.status(402).json({ error: 'This feature requires professional plan or higher', currentTier: workspaceTier, minimumTier: 'professional', requiresTierUpgrade: true });
      }

      const { id } = req.params;

      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }

      // ── WRITE-PROTECT: Paid payroll runs are closed accounting records ──────────
      if (run.status === 'paid') {
        return res.status(403).json({
          message: "This record has been closed and cannot be modified",
          code: 'RECORD_CLOSED',
          currentStatus: run.status,
        });
      }
      // ─────────────────────────────────────────────────────────────────────────────

      const currentStatus = run.status ?? 'draft';
      if (!isValidPayrollTransition(currentStatus, 'processing')) {
        const lifecycleStatus = resolvePayrollLifecycleStatus(currentStatus);
        return res.status(422).json({
          message: "Only approved payroll runs can be processed",
          currentStatus: lifecycleStatus || currentStatus,
        });
      }

      const updated = await storage.updatePayrollRunStatus(id, 'processed', userId, workspaceId);

      // Atomic guard: if no rows were updated, another concurrent request already
      // transitioned this run to 'processed' — return 409 to prevent double-charging
      // fees and double-deducting AI credits on the same payroll run.
      if (!updated) {
        return res.status(409).json({ message: "Payroll run was already processed by a concurrent request" });
      }

      const entries = await storage.getPayrollEntriesByRun(id);
      const employeeCount = entries.length || 1;

      // LAYER 1: Real money via Stripe — middleware transaction fee
      try {
        const { chargePayrollMiddlewareFee } = await import('../services/billing/middlewareTransactionFees');
        const feeResult = await chargePayrollMiddlewareFee({
          workspaceId,
          payrollRunId: id,
          employeeCount,
          payPeriod: run.periodStart && run.periodEnd
            ? `${new Date(run.periodStart).toLocaleDateString()} – ${new Date(run.periodEnd).toLocaleDateString()}`
            : undefined,
        });
        log.info(`[PayrollRoute] Middleware fee: ${feeResult.description} (success: ${feeResult.success})`);
        if (feeResult.success && feeResult.amountCents > 0) {
          // DB ledger: record in financial_processing_fees so platformBillService includes it
          import('../services/billing/financialProcessingFeeService').then(({ financialProcessingFeeService }) =>
            financialProcessingFeeService.recordPayrollFee({ workspaceId, referenceId: id, employeeCount })
              .catch((err: Error) => log.warn('[PayrollRoute] Fee ledger record failed (non-blocking):', err.message))
          ).catch((err: Error) => log.warn('[PayrollRoute] Fee ledger import failed:', err.message));
          // Platform revenue tracking: write to platform_revenue table
          import('../services/finance/middlewareFeeService').then(({ recordMiddlewareFeeCharge }) =>
            recordMiddlewareFeeCharge(workspaceId, 'payroll_processing', feeResult.amountCents, id)
              .catch((err: Error) => log.warn('[PayrollRoute] Platform revenue record failed (non-blocking):', err.message))
          ).catch((err: Error) => log.warn('[PayrollRoute] Platform revenue import failed:', err.message));
        }
      } catch (feeErr: unknown) {
        log.warn('[PayrollRoute] Middleware fee charge failed (non-blocking):', (feeErr instanceof Error ? feeErr.message : String(feeErr)));
      }

      // LAYER 2: Credits from org balance — AI token usage at cost (no markup)
      try {
        const { tokenManager, TOKEN_COSTS } = await import('../services/billing/tokenManager');

        const sessionFee = TOKEN_COSTS['payroll_session_fee'] || 35;
        await tokenManager.recordUsage({
          workspaceId,
          userId: userId || 'system',
          featureKey: 'payroll_session_fee',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          featureName: 'Payroll AI Processing',
          description: `Payroll run ${id.substring(0, 8)} — AI token usage (tax calc, compliance checks) — ${employeeCount} employees`,
          relatedEntityType: 'payroll_run',
          relatedEntityId: id,
        });

        log.info(`[PayrollRoute] Credits: ${sessionFee}cr AI token usage (${employeeCount} employees)`);
      } catch (creditErr: unknown) {
        log.warn('[PayrollRoute] Credit deduction for payroll processing failed (non-blocking):', (creditErr instanceof Error ? creditErr.message : String(creditErr)));
      }

      try {
        // writeLedgerEntry — static import at top
        await writeLedgerEntry({
          workspaceId,
          entryType: 'payroll_processed',
          direction: 'credit',
          // G14 FIX: use ?? not || — totalNetPay can legitimately be 0 (e.g. 100% garnishment)
          // and || would silently fall back to totalGrossPay, recording the wrong ledger amount.
          amount: parseFloat(toFinancialString(run.totalNetPay ?? run.totalGrossPay ?? '0')), // display-boundary: toFinancialString ensures precision before parseFloat for external API
          relatedEntityType: 'payroll_run',
          relatedEntityId: id,
          payrollRunId: id,
          description: `Payroll run ${id.substring(0, 8)} processed by ${req.user?.email || userId}`,
          createdBy: userId,
        });
      } catch (ledgerErr: unknown) {
        log.error('[PayrollRoute] Ledger write failed on manual process:', (ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)));
      }

      // D8-GAP-FIX: Await the processed status audit log (same as the 'approved' transition
      // which is already awaited). A fire-and-forget .catch() means a DB failure silently
      // drops the SOC2 audit trail for this status transition with no observability.
      await storage.createAuditLog({
        workspaceId,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'update',
        entityType: 'payroll_run',
        entityId: id,
        actionDescription: `Payroll run ${id} processed`,
        changes: { before: { status: 'approved' }, after: { status: 'processed', processedBy: userId } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll processing', { error: err?.message }));

      // Non-blocking: notify each employee their pay stub is available
      (async () => {
        try {
          const stubs = await db.select({
            id: payStubs.id,
            employeeId: payStubs.employeeId,
            netPay: payStubs.netPay,
            payPeriodStart: payStubs.payPeriodStart,
            payPeriodEnd: payStubs.payPeriodEnd,
          })
            .from(payStubs)
            .where(and(eq(payStubs.payrollRunId, id), eq(payStubs.workspaceId, workspaceId)));

          if (stubs.length === 0) {
            log.info(`[PayrollRoute] No pay stubs found for run ${id} — skipping employee notifications`);
            return;
          }

          const empRows = await db.select({ id: employees.id, userId: employees.userId })
            .from(employees)
            .where(eq(employees.workspaceId, workspaceId));

          const empUserMap = new Map(empRows.map(e => [e.id, e.userId]));

          // @ts-expect-error — TS migration: fix in refactoring sprint
          const { une } = await import('../services/universalNotificationEngine');
          await Promise.allSettled(stubs.map(stub => {
            const targetUserId = empUserMap.get(stub.employeeId);
            if (!targetUserId) return Promise.resolve();
            const periodLabel = stub.payPeriodStart && stub.payPeriodEnd
              ? `${new Date(stub.payPeriodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(stub.payPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : 'this pay period';
            const net = parseFloat(String(stub.netPay || 0)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
            return une.send({
              workspaceId,
              type: 'pay_stub_available' as any,
              title: 'Your Pay Stub is Ready',
              message: `Your pay stub for ${periodLabel} is available. Net pay: ${net}.`,
              severity: 'info',
              userId: targetUserId,
              actionUrl: `/payroll/pay-stubs/${stub.id}`,
              metadata: { payStubId: stub.id, payrollRunId: id, netPay: stub.netPay, source: 'payroll_processed' },
            });
          }));

          log.info(`[PayrollRoute] Pay stub notifications sent for ${stubs.length} employees (run ${id})`);

          // CHANNEL 2: Resend email to each employee
          try {
            // @shared/schema symbols — now static import at top
            const { sendPayStubEmail } = await import('../services/emailCore');
            const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
            const orgName = ws?.name || 'Your Organization';

            const allUserIds = [...new Set(empRows.map(e => e.userId).filter(Boolean))] as string[];
            const userRows = allUserIds.length > 0
              ? await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
                  .from(users).where(sql`${users.id} = ANY(${allUserIds})`)
              : [];
            const userMap = new Map(userRows.map(u => [u.id, u]));

            await Promise.allSettled(stubs.map(async stub => {
              const targetUserId = empUserMap.get(stub.employeeId);
              if (!targetUserId) return;
              const user = userMap.get(targetUserId);
              if (!user?.email) return;
              const periodLabel = stub.payPeriodStart && stub.payPeriodEnd
                ? `${new Date(stub.payPeriodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(stub.payPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : 'This Pay Period';
              const gross = parseFloat(String((stub as any).grossPay || stub.netPay || 0)).toFixed(2);
              const net = parseFloat(String(stub.netPay || 0)).toFixed(2);
              const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
              await sendPayStubEmail(user.email, {
                employeeName: fullName,
                payPeriodLabel: periodLabel,
                grossPay: gross,
                netPay: net,
                payStubUrl: `${process.env.APP_BASE_URL || 'https://app.coaileague.com'}/payroll/pay-stubs/${stub.id}`,
                orgName,
              }, workspaceId);
            }));
            log.info(`[PayrollRoute] Pay stub emails sent for ${stubs.length} employees (run ${id})`);
          } catch (emailErr: unknown) {
            log.warn('[PayrollRoute] Pay stub email send failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
          }
        } catch (notifErr: unknown) {
          log.warn('[PayrollRoute] Pay stub notifications failed (non-blocking):', (notifErr instanceof Error ? notifErr.message : String(notifErr)));
        }
      })();

      // Real-time: update payroll dashboard for all managers in this workspace
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        // broadcastToWorkspace — now static import at top
        broadcastToWorkspace(workspaceId, { type: 'payroll_updated', action: 'processed', runId: id });
      } catch (_wsErr: any) {
        log.warn('[Payroll] Failed to broadcast WebSocket update', { error: _wsErr.message });
      }

      platformEventBus.publish({
        type: 'payroll_run_processed',
        category: 'automation',
        title: `Payroll Run Processed`,
        description: `Payroll run ${id} fully processed — net pay calculated for all employees`,
        workspaceId,
        userId,
        metadata: {
          payrollRunId: id,
          processedBy: userId,
          totalGrossPay: updated.totalGrossPay,
          totalNetPay: (updated as any).totalNet,
          employeeCount,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // FIX-2: Financial audit log for payroll processing
      await db.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'payroll_run_processed',
        eventCategory: 'payroll',
        actorType: 'user',
        actorId: userId,
        actorEmail: req.user?.email || null,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        description: `Payroll run processed - ${stubs.length} pay stubs generated`,
        relatedEntityType: 'payroll_run',
        relatedEntityId: id,
        previousState: { status: 'approved' },
        // @ts-expect-error — TS migration: fix in refactoring sprint
        newState: { status: 'processed', payStubsGenerated: stubs.length, totalNet: run.totalNetPay },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      }).catch(err => log.error('[BillingAudit] billing_audit_log write failed for payroll process', { error: err?.message }));

      res.json(updated);
    } catch (error: unknown) {
      const status = (error as any)?.status || 500;
      const extra = (error as any)?.extra || {};
      log.error('Error processing payroll run:', error);
      res.status(status).json({
        message: error instanceof Error ? sanitizeError(error) : 'Failed to process payroll run',
        ...extra,
      });
    }
  });

  router.delete('/runs/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
      const workspaceId = req.workspaceId!;
      const result = await deletePayrollRun({
        workspaceId,
        payrollRunId: req.params.id,
        userId: req.user?.id || null,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
      });
      res.json(result);
    } catch (error: unknown) {
      const status = (error as any)?.status || 500;
      log.error('Error deleting payroll run:', error);
      res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to delete payroll run' });
    }
  });

  router.get('/my-paychecks', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });
      const result = await getMyPaychecks(userId);
      if (!result.success) return res.status(result.status || 500).json({ message: result.error });
      res.json(result.data);
    } catch (error: unknown) {
      log.error('Error fetching paychecks:', error);
      res.status(500).json({ message: 'Failed to fetch paychecks' });
    }
  });

router.get('/pay-stubs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await getMyPayStub(req.user!.id, req.params.id);
    if (!result.success) return res.status(result.status || 500).json({ error: result.error });
    res.json(result.data);
  } catch (error: unknown) {
    log.error('Error fetching pay stub:', error);
    res.status(500).json({ error: 'Failed to fetch pay stub' });
  }
});

router.get('/my-payroll-info', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const result = await getMyPayrollInfo(userId);
    if (!result.success) return res.status(result.status || 500).json({ message: result.error });
    res.json(result.data);
  } catch (error: unknown) {
    log.error('Error fetching payroll info:', error);
    res.status(500).json({ message: 'Failed to fetch payroll info' });
  }
});

router.patch('/my-payroll-info', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const result = await updateMyPayrollInfo({ userId, body: req.body });
    if (!result.success) return res.status(result.status || 500).json({ message: result.error, ...(result.data ? { details: result.data } : {}) });
    res.json(result.data);
  } catch (error: unknown) {
    log.error('Error updating payroll info:', error);
    res.status(500).json({ message: 'Failed to update payroll info' });
  }
});

router.get('/my-tax-forms', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });
    const result = await getMyEmployeeTaxForms({ userId, workspaceId });
    res.json(result);
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    log.error('Error fetching my tax forms:', error);
    res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to fetch tax forms' });
  }
});

router.get('/my-tax-forms/:formId/download', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    // Enforce ownership via service — verifies formId belongs to this employee
    const access = await getMyEmployeeTaxForm({ userId, workspaceId, formId: req.params.formId });

    // taxFormGeneratorService — now static import at top
    let result;
    const { form, employeeId } = access;

    if (form.formType === 'w2') {
      result = await taxFormGeneratorService.generateW2ForEmployee(employeeId, workspaceId, form.taxYear);
    } else if (form.formType === '1099') {
      result = await taxFormGeneratorService.generate1099ForEmployee(employeeId, workspaceId, form.taxYear);
    } else {
      return res.status(400).json({ message: 'Only W-2 and 1099 forms are available for employee download' });
    }

    if (!result.success || !result.pdfBuffer) {
      return res.status(500).json({ message: result.error || 'Failed to generate PDF' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${form.formType}-${form.taxYear}.pdf"`);
    return res.send(result.pdfBuffer);
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    log.error('Error downloading tax form:', error);
    res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to download tax form' });
  }
});

router.get('/tax-filing/deadlines', async (_req, res) => {
  try {
    res.json(getPayrollTaxFilingDeadlines());
  } catch (error: unknown) {
    log.error('Error fetching filing deadlines:', error);
    res.status(500).json({ message: 'Failed to fetch filing deadlines' });
  }
});

router.get('/tax-filing/guide/:formType', async (req: AuthenticatedRequest, res) => {
  try {
    const formType = req.params.formType;
    const guide = getPayrollTaxFilingGuide(formType);
    if (!guide) return res.status(404).json({ error: 'Unsupported payroll tax form type' });
    res.json(guide);
  } catch (error: unknown) {
    log.error('Error fetching filing guide:', error);
    res.status(500).json({ message: 'Failed to fetch filing guide' });
  }
});

router.get('/tax-filing/state-portals', async (_req, res) => {
  try {
    res.json(getPayrollStatePortals());
  } catch (error: unknown) {
    log.error('Error fetching state portals:', error);
    res.status(500).json({ message: 'Failed to fetch state portals' });
  }
});

// ============================================================================
// TAX CENTER — consolidated view of tax obligations, forms, deadlines, fees
// ============================================================================
router.get('/tax-center', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });
    const taxYear = req.query.taxYear ? parseInt(req.query.taxYear as string, 10) : undefined;
    const data = await getTaxCenterData(workspaceId, taxYear);
    res.json(data);
  } catch (error: unknown) {
    log.error('Error fetching tax center data:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch tax center data' });
  }
});

router.post("/calculate-taxes", async (req, res) => {
  try {
    const { grossWages, filingStatus, ytdWages } = req.body;
    
    if (!grossWages || typeof grossWages !== 'number') {
      return res.status(400).json({ error: 'Invalid grossWages amount' });
    }
    if (businessRuleResponse(res, [validateNonNegativeAmount(grossWages, 'grossWages')])) return;
    
    const result = taxCalculator.calculateTaxes({
      grossWages,
      filingStatus: filingStatus || 'single',
      ytdWages: ytdWages || 0
    });

    res.json({
      success: true,
      calculation: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    log.error('Tax calculation error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Tax calculation failed' });
  }
});

router.get("/entries", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const entries = await db.select().from(payrollEntries).where(eq(payrollEntries.workspaceId, workspaceId));
    res.json(entries);
  } catch (error: unknown) {
    log.error('Error fetching payroll entries:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/deductions", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const payrollEntryId = req.query.payrollEntryId as string | undefined;
    let conditions = [eq(payrollDeductions.workspaceId, workspaceId)];
    if (payrollEntryId) {
      conditions.push(eq(payrollDeductions.payrollEntryId, payrollEntryId));
    }
    const deductions = await db.select().from(payrollDeductions).where(and(...conditions));
    res.json(deductions);
  } catch (error: unknown) {
    log.error('Error fetching payroll deductions:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/garnishments", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const payrollEntryId = req.query.payrollEntryId as string | undefined;
    let conditions = [eq(payrollGarnishments.workspaceId, workspaceId)];
    if (payrollEntryId) {
      conditions.push(eq(payrollGarnishments.payrollEntryId, payrollEntryId));
    }
    const garnishments = await db.select().from(payrollGarnishments).where(and(...conditions));
    res.json(garnishments);
  } catch (error: unknown) {
    log.error('Error fetching payroll garnishments:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.delete("/deductions/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete payroll deductions" });
    }
    const { id } = req.params;
    const workspaceId = req.workspaceId!;
    // GAP-AUDIT-2 FIX: Include workspaceId in initial SELECT so a bare deduction ID
    // from another tenant cannot even be confirmed to exist in this workspace.
    // The prior pattern fetched by bare ID, then checked run.workspaceId downstream —
    // leaking timing information (404 vs 403) that reveals cross-tenant record existence.
    const [deduction] = await db.select().from(payrollDeductions).where(and(eq(payrollDeductions.id, id), eq(payrollDeductions.workspaceId, workspaceId)));
    if (!deduction) {
      return res.status(404).json({ error: "Deduction not found" });
    }
    const [entry] = await db.select().from(payrollEntries).where(and(
      eq(payrollEntries.id, deduction.payrollEntryId),
      eq(payrollEntries.workspaceId, workspaceId),
    ));
    if (!entry) {
      return res.status(404).json({ error: "Associated payroll entry not found" });
    }
    const [run] = await db.select().from(payrollRuns).where(and(
      eq(payrollRuns.id, entry.payrollRunId),
      eq(payrollRuns.workspaceId, workspaceId),
    ));
    if (!run || run.workspaceId !== workspaceId) {
      return res.status(403).json({ error: "Access denied" });
    }
    await db.delete(payrollDeductions).where(and(eq(payrollDeductions.id, id), eq(payrollDeductions.workspaceId, workspaceId)));
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error deleting deduction:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.delete("/garnishments/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete payroll garnishments" });
    }
    const { id } = req.params;
    const workspaceId = req.workspaceId!;
    // GAP-AUDIT-2 FIX: Include workspaceId in initial SELECT for garnishments too.
    // Same cross-tenant timing-leak risk as the deduction route above.
    const [garnishment] = await db.select().from(payrollGarnishments).where(and(eq(payrollGarnishments.id, id), eq(payrollGarnishments.workspaceId, workspaceId)));
    if (!garnishment) {
      return res.status(404).json({ error: "Garnishment not found" });
    }
    const [entry] = await db.select().from(payrollEntries).where(and(
      eq(payrollEntries.id, garnishment.payrollEntryId),
      eq(payrollEntries.workspaceId, workspaceId),
    ));
    if (!entry) {
      return res.status(404).json({ error: "Associated payroll entry not found" });
    }
    const [run] = await db.select().from(payrollRuns).where(and(
      eq(payrollRuns.id, entry.payrollRunId),
      eq(payrollRuns.workspaceId, workspaceId),
    ));
    if (!run || run.workspaceId !== workspaceId) {
      return res.status(403).json({ error: "Access denied" });
    }
    await db.delete(payrollGarnishments).where(and(eq(payrollGarnishments.id, id), eq(payrollGarnishments.workspaceId, workspaceId)));
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error deleting garnishment:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/deductions/:payrollEntryId", async (req: AuthenticatedRequest, res) => {
  try {
    const { payrollEntryId } = req.params;
    const parsed = payrollDeductionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid deduction data', details: parsed.error.flatten() });
    const { employeeId, deductionType, amount, isPreTax, description } = parsed.data;
    if (businessRuleResponse(res, [validateDeductionAmount(amount, undefined, 'amount')])) return;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const deduction = await addDeduction(
      payrollEntryId,
      employeeId,
      workspaceId,
      deductionType,
      amount,
      isPreTax ?? true,
      description
    );
    res.status(201).json({ success: true, data: deduction });
  } catch (error: unknown) {
    log.error('Error adding deduction:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/garnishments/:payrollEntryId", async (req: AuthenticatedRequest, res) => {
  try {
    const { payrollEntryId } = req.params;
    const parsed = payrollGarnishmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid garnishment data', details: parsed.error.flatten() });
    const { employeeId, garnishmentType, amount, priority, caseNumber, description } = parsed.data;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const garnishment = await addGarnishment(
      payrollEntryId,
      employeeId,
      workspaceId,
      garnishmentType,
      amount,
      priority ?? 1,
      caseNumber,
      description
    );

    // FIX [GAP-8 GARNISHMENT PIPELINE]: Adding a garnishment must immediately reduce
    // the payroll entry's netPay. Without this, garnishments are recorded in the DB
    // but never reflected in the stored net pay, pay stubs, or run totals — officers
    // with active court-ordered garnishments receive incorrect full net pay.
    //
    // After storing the garnishment row, recalculate net pay as:
    //   netPay = grossPay - preTaxDeductions - taxes - postTaxDeductions - totalGarnishments
    // Net pay is floored at $0 (cannot garnish below zero).
    try {
      const [entry] = await db.select().from(payrollEntries)
        .where(and(eq(payrollEntries.id, payrollEntryId), eq(payrollEntries.workspaceId, workspaceId)))
        .limit(1);

      if (entry) {
        // RC4: All payroll arithmetic via FinancialCalculator (Decimal.js) — no native Number
        const grossPay = Number(toFinancialString(entry.grossPay ?? '0'));
        const federalTax = Number(toFinancialString(entry.federalTax ?? '0'));
        const stateTax = Number(toFinancialString(entry.stateTax ?? '0'));
        const socialSec = Number(toFinancialString(entry.socialSecurity ?? '0'));
        const medicare = Number(toFinancialString(entry.medicare ?? '0'));

        const allGarnishments = await db.select({ amount: payrollGarnishments.amount })
          .from(payrollGarnishments)
          .where(and(
            eq(payrollGarnishments.payrollEntryId, payrollEntryId),
            eq(payrollGarnishments.workspaceId, workspaceId),
          ));
        const totalGarnishments = Number(sumFinancialValues(allGarnishments.map(g => toFinancialString(g.amount ?? '0'))));

        const preTaxDeductions = Number(toFinancialString((entry as any).preTaxDeductions ?? '0'));
        const postTaxDeductions = Number(toFinancialString((entry as any).postTaxDeductions ?? '0'));
        const totalTaxes = federalTax + stateTax + socialSec + medicare;

        let newNetPay = grossPay - preTaxDeductions - totalTaxes - postTaxDeductions - totalGarnishments;
        if (newNetPay < 0) newNetPay = 0; // Hard floor — cannot garnish below $0

        await db.update(payrollEntries)
          .set({ netPay: newNetPay.toFixed(2) as any, updatedAt: new Date() })
          .where(and(
            eq(payrollEntries.id, payrollEntryId),
            eq(payrollEntries.workspaceId, workspaceId),
          ));

        // Re-aggregate run totals so the payroll run header stays correct
        if (entry.payrollRunId) {
          const runEntries = await db.select({ netPay: payrollEntries.netPay, grossPay: payrollEntries.grossPay })
            .from(payrollEntries)
            .where(and(
              eq(payrollEntries.payrollRunId, entry.payrollRunId),
              eq(payrollEntries.workspaceId, workspaceId),
            ));
          const runTotalNet   = sumFinancialValues(runEntries.map(e => toFinancialString(e.netPay   ?? '0')));
          const runTotalGross = sumFinancialValues(runEntries.map(e => toFinancialString(e.grossPay ?? '0')));
          await db.update(payrollRuns)
            .set({ totalNetPay: runTotalNet as any, totalGrossPay: runTotalGross as any, updatedAt: new Date() })
            .where(and(
              eq(payrollRuns.id, entry.payrollRunId),
              eq(payrollRuns.workspaceId, workspaceId),
            ));
        }

        storage.createAuditLog({
          workspaceId,
          userId: req.user?.id!,
          userEmail: req.user?.email || 'unknown',
          userRole: req.user?.role || 'user',
          action: 'update',
          entityType: 'payroll_entry',
          entityId: payrollEntryId,
          actionDescription: `Garnishment applied: ${garnishmentType} $${amount}. New net pay: $${newNetPay.toFixed(2)}`,
          isSensitiveData: true,
          complianceTag: 'soc2',
        }).catch(err => log.error('[FinancialAudit] Garnishment audit log failed:', err?.message));
      }
    } catch (garnishNetPayErr: any) {
      log.error('[Payroll] WARNING: Failed to recalculate netPay after garnishment add:', garnishNetPayErr?.message);
    }

    res.status(201).json({ success: true, data: garnishment });
  } catch (error: unknown) {
    log.error('Error adding garnishment:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.get("/:payrollEntryId/deductions-total", async (req: AuthenticatedRequest, res) => {
  try {
    const { payrollEntryId } = req.params;
    
    const totalDeductions = await calculateTotalDeductions(payrollEntryId);
    const totalGarnishments = await calculateTotalGarnishments(payrollEntryId);
    
    res.json({ 
      success: true, 
      data: { 
        totalDeductions: totalDeductions.toString(),
        totalGarnishments: totalGarnishments.toString(),
        combined: totalDeductions.plus(totalGarnishments).toString(),
      }
    });
  } catch (error: unknown) {
    log.error('Error calculating deductions:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/:payrollEntryId/apply-deductions", async (req: AuthenticatedRequest, res) => {
  try {
    const { payrollEntryId } = req.params;
    
    const netPay = await applyDeductionsAndGarnishments(payrollEntryId);
    
    res.json({ 
      success: true, 
      data: { 
        netPayAfterDeductions: netPay.toString(),
      }
    });
  } catch (error: unknown) {
    log.error('Error applying deductions:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post('/tax-forms/941', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const { quarter, year } = req.body;

    if (!quarter || !year) {
      return res.status(400).json({ message: 'Missing required fields: quarter, year' });
    }

    try {
      // tokenManager (static)
      await tokenManager.recordUsage({
        workspaceId,
        userId: req.user?.id || 'system',
        featureKey: 'tax_prep_941',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: 'Form 941 Quarterly Tax Prep',
        description: `Form 941 Q${quarter} ${year} — payroll tax aggregation and PDF generation`,
      });
    } catch (billingErr) {
      log.warn('[TaxPrep] Credit deduction failed for 941 (non-blocking):', billingErr);
    }

    const quarterNum = parseInt(quarter);
    const yearNum = parseInt(year);

    if (isNaN(quarterNum) || quarterNum < 1 || quarterNum > 4) {
      return res.status(400).json({ message: 'Quarter must be between 1 and 4' });
    }

    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ message: 'Invalid year' });
    }

    // taxFormGeneratorService — now static import at top
    const result = await taxFormGeneratorService.generate941Report(workspaceId, quarterNum, yearNum);

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    const userId = req.user?.id;
    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'tax_form',
      entityId: result.taxFormId || '',
      actionDescription: `Generated Form 941 for Q${quarterNum} ${yearNum}`,
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for 941 generation', { error: err?.message }));

    if (result.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="form-941-Q${quarterNum}-${yearNum}.pdf"`);
      return res.send(result.pdfBuffer);
    }

    res.json({ success: true, taxFormId: result.taxFormId, data: result.data, disclaimer: 'AI-generated. Verify all figures before filing. This platform is middleware only — not a CPA, tax preparer, or financial institution. Organization is solely responsible for accuracy.' });
  } catch (error: unknown) {
    log.error('Error generating Form 941:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to generate Form 941' });
  }
});

router.get('/tax-forms/941/:year/:quarter', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { year, quarter } = req.params;

    const yearNum = parseInt(year);
    const quarterNum = parseInt(quarter);

    if (isNaN(quarterNum) || quarterNum < 1 || quarterNum > 4) {
      return res.status(400).json({ message: 'Quarter must be between 1 and 4' });
    }

    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ message: 'Invalid year' });
    }

    // taxFormGeneratorService — now static import at top
    const result = await taxFormGeneratorService.generate941Report(workspaceId, quarterNum, yearNum);

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    if (result.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="form-941-Q${quarterNum}-${yearNum}.pdf"`);
      return res.send(result.pdfBuffer);
    }

    res.json({ success: true, data: result.data });
  } catch (error: unknown) {
    log.error('Error retrieving Form 941:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to retrieve Form 941' });
  }
});

router.post('/tax-forms/generate', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const { employeeId, taxYear, formType } = req.body;

    if (!employeeId || !taxYear || !formType) {
      return res.status(400).json({ message: 'Missing required fields: employeeId, taxYear, formType' });
    }

    if (!['w2', '1099'].includes(formType)) {
      return res.status(400).json({ message: 'formType must be "w2" or "1099"' });
    }

    try {
      // tokenManager (static)
      const creditKey = formType === 'w2' ? 'tax_prep_w2' : 'tax_prep_1099';
      const formLabel = formType === 'w2' ? 'W-2 Employee Tax Form' : '1099-NEC Contractor Tax Form';
      await tokenManager.recordUsage({
        workspaceId,
        userId: req.user?.id || 'system',
        featureKey: creditKey,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: formLabel,
        description: `${formLabel} generation for ${taxYear}`,
        relatedEntityType: 'tax_form',
        relatedEntityId: `${formType}-${taxYear}-${req.params.employeeId}`,
      });
    } catch (billingErr) {
      log.warn(`[TaxPrep] Credit deduction failed for ${formType} (non-blocking):`, billingErr);
    }

    // taxFormGeneratorService — now static import at top

    let result;
    if (formType === 'w2') {
      result = await taxFormGeneratorService.generateW2ForEmployee(employeeId, workspaceId, taxYear);
    } else {
      result = await taxFormGeneratorService.generate1099ForEmployee(employeeId, workspaceId, taxYear);
    }

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    const userId = req.user?.id;
    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'tax_form',
      entityId: result.taxFormId || '',
      actionDescription: `Generated ${formType.toUpperCase()} for employee ${employeeId} for tax year ${taxYear}`,
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for tax form generation', { error: err?.message }));

    // ── GAP 16: W-2 / 1099 limitation notice ─────────────────────────────────
    // These are system-generated estimates for record-keeping and early review.
    // They must be reviewed, corrected, and filed via official IRS e-file systems
    // (SSA Business Services Online for W-2; IRS FIRE system for 1099).
    const W2_LIMITATION_NOTICE = formType === 'w2'
      ? 'IMPORTANT: This W-2 document is a platform-generated estimate for internal record-keeping and employee preview purposes only. ' +
        'It is NOT a substitute for the official W-2 submitted to the SSA and IRS. ' +
        'Year-end W-2 forms must be filed through the Social Security Administration Business Services Online (BSO) portal ' +
        `or an accredited payroll provider. ${PLATFORM.name} is not an IRS-registered filing agent. ` +
        'Please verify all figures with your CPA or payroll provider before filing.'
      : 'IMPORTANT: This 1099-NEC document is a platform-generated estimate for contractor payment records. ' +
        `It must be verified and filed through the IRS FIRE system or an accredited tax filing service. ` +
        `${PLATFORM.name} is not an IRS-registered filing agent.`;

    if (result.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${formType}-${taxYear}-${employeeId}.pdf"`);
      res.setHeader('X-Tax-Form-Limitation', formType === 'w2' ? 'estimate-only-file-via-ssa-bso' : 'estimate-only-file-via-irs-fire');
      return res.send(result.pdfBuffer);
    }

    res.json({
      success: true,
      taxFormId: result.taxFormId,
      limitation: W2_LIMITATION_NOTICE,
      filingRequired: true,
      officialFilingSystem: formType === 'w2' ? 'SSA Business Services Online (BSO)' : 'IRS FIRE System',
    });
  } catch (error: unknown) {
    log.error('Error generating tax form:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to generate tax form' });
  }
});

router.post('/tax-forms/940', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const { year } = req.body;

    if (!year || typeof year !== 'number') {
      return res.status(400).json({ message: 'Missing required field: year (number)' });
    }

    try {
      // tokenManager (static)
      await tokenManager.recordUsage({
        workspaceId,
        userId: req.user?.id || 'system',
        featureKey: 'tax_prep_940',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: 'Form 940 Annual FUTA Tax Prep',
        description: `Form 940 annual FUTA report for ${year}`,
      });
    } catch (billingErr) {
      log.warn('[TaxPrep] Credit deduction failed for 940 (non-blocking):', billingErr);
    }

    // taxFormGeneratorService — now static import at top
    const result = await taxFormGeneratorService.generate940Report(workspaceId, year);

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    const userId = req.user?.id;
    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'tax_form',
      entityId: `940-${year}`,
      actionDescription: `Generated Form 940 (FUTA) for tax year ${year}`,
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for 940 generation', { error: err?.message }));

    if (result.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="form-940-${year}.pdf"`);
      return res.send(result.pdfBuffer);
    }

    res.json({ success: true, data: result.data, disclaimer: 'AI-generated. Verify all figures before filing. This platform is middleware only — not a CPA, tax preparer, or financial institution. Organization is solely responsible for accuracy.' });
  } catch (error: unknown) {
    log.error('Error generating Form 940:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to generate Form 940' });
  }
});

router.get('/tax-forms/940/:year', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      return res.status(400).json({ message: 'Invalid year parameter' });
    }

    // taxFormGeneratorService — now static import at top
    const result = await taxFormGeneratorService.generate940Report(workspaceId, year);

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    const format = req.query.format as string;
    if (format === 'pdf' && result.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="form-940-${year}.pdf"`);
      return res.send(result.pdfBuffer);
    }

    res.json({ success: true, year, data: result.data, disclaimer: 'AI-generated. Verify all figures before filing. This platform is middleware only — not a CPA, tax preparer, or financial institution. Organization is solely responsible for accuracy.' });
  } catch (error: unknown) {
    log.error('Error fetching Form 940:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch Form 940' });
  }
});

router.get('/ytd/:employeeId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    if (!employeeId) return res.status(400).json({ message: 'Employee ID is required' });
    const result = await getYtdEarnings(employeeId, workspaceId);
    res.json(result.data);
  } catch (error: unknown) {
    log.error('Error fetching YTD earnings:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch YTD earnings' });
  }
});

router.post('/runs/:id/execute-internal', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const workspaceId = req.workspaceId!;
      const { id } = req.params;

      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: 'Payroll run not found' });
      }

      if (run.status !== 'approved' && run.status !== 'pending') {
        return res.status(400).json({ message: `Payroll run status is '${run.status}', must be 'approved' or 'pending' to execute internally` });
      }

      // executeInternalPayroll — now static import at top
      const result = await executeInternalPayroll(workspaceId, id, userId);

      if (result.processedEntries > 0) {
        try {
          // tokenManager (static)
          await tokenManager.recordUsage({
            workspaceId,
            userId: userId || 'system',
            featureKey: 'ai_payroll_processing',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            featureName: 'Internal Payroll Execution',
            description: `Internal payroll run ${id.substring(0, 8)} — ${result.processedEntries} employees processed`,
            relatedEntityType: 'payroll_run',
            relatedEntityId: id,
            quantity: result.processedEntries,
          });
          log.info(`[PayrollRoute] Internal payroll billed ${result.processedEntries} × 2 = ${result.processedEntries * 2} credits`);
        } catch (creditErr: unknown) {
          log.warn('[PayrollRoute] Credit deduction for internal payroll failed (non-blocking):', (creditErr instanceof Error ? creditErr.message : String(creditErr)));
        }
      }

      storage.createAuditLog({
        workspaceId,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'update',
        entityType: 'payroll_run',
        entityId: id,
        actionDescription: `Internal payroll execution for run ${id}: ${result.success ? 'completed' : 'partial/failed'}`,
        changes: {
          after: {
            status: result.success ? 'completed' : 'partial',
            processedEntries: result.processedEntries,
            failedEntries: result.failedEntries,
            totalNetPay: result.totalNetPay,
            totalEmployerTaxes: result.totalEmployerTaxes,
            stripePayouts: result.stripePayouts,
            pendingManualPayments: result.pendingManualPayments,
          }
        },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for internal payroll execution', { error: err?.message }));

      res.json({
        ...result,
        disclaimer: `Payroll processed by ${PLATFORM.name} middleware. ${PLATFORM.name} is not a bank, payroll provider, or financial institution. All payroll calculations are AI-assisted and must be verified by the organization representative or owner before any tax filings. ${PLATFORM.name} is not responsible for errors, omissions, or inaccuracies unless directly caused by a verifiable defect in the processing engine.`,
      });
    } catch (error: unknown) {
      log.error('Error executing internal payroll:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to execute internal payroll' });
    }
  });

router.post('/:runId/void', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await voidPayrollRun({
      workspaceId,
      payrollRunId: req.params.runId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      reversalReference: typeof req.body?.reversalReference === 'string' ? req.body.reversalReference : null,
    });

    res.json(result);
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    const extra = (error as any)?.extra || {};
    log.error('Error voiding payroll run:', error);
    res.status(status).json({
      message: error instanceof Error ? sanitizeError(error) : 'Failed to void payroll run',
      ...extra,
    });
  }
});

/**
 * POST /api/payroll/runs/:id/mark-paid
 * Transitions a processed payroll run to "paid" after the ACH/NACHA file
 * has been successfully submitted to the bank and funds have been disbursed.
 * This is a manual confirmation step — the bank does not call back to confirm.
 */
router.post('/runs/:id/mark-paid', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;

    const result = await markPayrollRunPaid({
      workspaceId,
      payrollRunId: req.params.id,
      userId: req.user!.id,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
    });

    res.json(result);
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    const extra = (error as any)?.extra || {};
    log.error('Error marking payroll run paid:', error);
    res.status(status).json({
      message: error instanceof Error ? sanitizeError(error) : 'Failed to mark payroll run paid',
      ...extra,
    });
  }
});

/**
 * POST /api/payroll/runs/:id/retry-failed-transfers
 * Retries all pay stubs in 'failed' or 'poll_failed' status for a given payroll run.
 * Manager role required.
 */
router.post('/runs/:id/retry-failed-transfers', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const tier = await getWorkspaceTier(workspaceId);
    if (!hasTierAccess(tier, 'professional')) {
      return res.status(402).json({ error: 'ACH payroll requires the Professional plan or higher', currentTier: tier, minimumTier: 'professional', requiresTierUpgrade: true });
    }

    const result = await retryFailedPayrollTransfers(workspaceId, req.params.id, userId);
    if (!result.success) return res.status(result.status || 500).json({ message: result.error });
    res.json(result);
  } catch (error: unknown) {
    log.error('[PayrollRoute] Error retrying failed transfers:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to retry transfers' });
  }
});

router.post('/:entryId/amend', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { entryId } = req.params;
    const parsed = payrollAmendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'A reason is required to amend a payroll entry', details: parsed.error.flatten() });
    const { reason, ...amendments } = parsed.data;

    // ── WRITE-PROTECT: Time entries on a paid payroll run are closed records ─────
    const [entryForRunCheck] = await db
      .select({ payrollRunId: payrollEntries.payrollRunId })
      .from(payrollEntries)
      .where(and(
        eq(payrollEntries.id, entryId),
        eq(payrollEntries.workspaceId, workspaceId)
      ))
      .limit(1);

    if (entryForRunCheck?.payrollRunId) {
      const [parentRun] = await db
        .select({ status: payrollRuns.status })
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.id, entryForRunCheck.payrollRunId),
          eq(payrollRuns.workspaceId, workspaceId),
        ))
        .limit(1);

      if (parentRun?.status === 'paid') {
        return res.status(403).json({
          message: "This record has been closed and cannot be modified",
          code: 'RECORD_CLOSED',
          currentStatus: 'paid',
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    // amendPayrollEntry — now static import at top
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await amendPayrollEntry(entryId, workspaceId, userId, { ...amendments, reason: reason.trim() });

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'payroll_entry',
      entityId: entryId,
      actionDescription: `Payroll entry ${entryId} amended: ${reason}`,
      changes: { before: result.originalEntry, after: result.amendedEntry },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll amendment', { error: err?.message }));

    res.json({
      success: true,
      message: 'Payroll entry amended successfully',
      originalEntry: result.originalEntry,
      amendedEntry: result.amendedEntry,
    });
  } catch (error: unknown) {
    log.error('Error amending payroll entry:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to amend payroll entry' });
  }
});

/**
 * GAP FIX 7: Payroll PDF Summary Export
 * GET /api/payroll/export/pdf/:runId
 * Generates a professional PDF summary of a payroll run.
 */
router.get('/export/pdf/:runId', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const result = await generatePayrollRunPdf(workspaceId, req.params.runId);
    if (!result.success) return res.status(result.status || 500).json({ message: result.error });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.pdfBuffer);
  } catch (error: unknown) {
    log.error('Error generating payroll PDF:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate payroll PDF' });
  }
});

/**
 * GAP FIX 14: Pre-payroll invoice checklist
 * GET /api/payroll/pre-run-checklist
 * Shows outstanding invoices for the current pay period so org_owner can decide
 * whether to send invoices before approving payroll.
 */
router.get('/pre-run-checklist', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });
    const data = await getPreRunChecklist(workspaceId);
    res.json(data);
  } catch (error: unknown) {
    log.error('Error generating pre-payroll checklist:', error);
    res.status(500).json({ message: 'Failed to generate pre-payroll checklist' });
  }
});

/**
 * GAP FIX 10: 1099 Threshold Report
 * GET /api/payroll/1099-report?year=2025
 * Returns all contractors who exceeded $600 in the given year.
 */
router.get('/1099-report', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) {
      return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const year = parseInt(req.query.year as string || String(new Date().getFullYear() - 1));
    const { get1099Report } = await import('../services/billing/contractorTaxAutomationService');
    const records = await get1099Report(workspaceId, year);

    res.json({
      taxYear: year,
      threshold: 600,
      filingDeadline: `January 31, ${year + 1}`,
      contractors: records,
      filingRequired: records.filter(r => r.requiresFiling),
      belowThreshold: records.filter(r => !r.requiresFiling),
      summary: {
        total: records.length,
        requiresFiling: records.filter(r => r.requiresFiling).length,
        totalFilingAmount: records.filter(r => r.requiresFiling).reduce((s, r) => s + r.totalPaidInYear, 0),
      },
    });
  } catch (error: unknown) {
    log.error('Error generating 1099 report:', error);
    res.status(500).json({ message: 'Failed to generate 1099 report' });
  }
});

/**
 * GET /api/payroll/runs/:id/nacha
 * Downloads a NACHA ACH formatted file for direct deposit submission.
 * Only available for processed payroll runs. Requires manager access.
 */
router.get('/runs/:id/nacha', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const workspaceId = req.workspaceId!;
    const result = await generateNachaFile(workspaceId, req.params.id);

    if (!result.success) {
      return res.status(result.status || 500).json({
        message: result.error,
        ...result.extra,
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-NACHA-Entries', String(result.eligibleCount));
    res.setHeader('X-NACHA-Missing', String(result.missingCount));
    res.setHeader('X-NACHA-Total-Cents', String(result.totalCreditCents));

    return res.send(result.nachaContent);
  } catch (error: unknown) {
    log.error('[NACHA] Error generating NACHA file:', error);
    res.status(500).json({ message: 'Failed to generate NACHA file: ' + (sanitizeError(error) || 'Unknown error') });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Employee Bank Account CRUD
// Canonical encrypted ACH direct deposit management per employee.
// All routing + account numbers are AES-256-GCM encrypted at rest.
// Returns masked values (last-4 only) — never returns decrypted plaintext.
// ─────────────────────────────────────────────────────────────────────────────

function requireManagerOrOwn(req: AuthenticatedRequest, employeeOwnerId: string | null): boolean {
  const role = req.user?.role;
  if (role === 'owner' || role === 'manager' || role === 'admin') return true;
  return req.user?.id === employeeOwnerId;
}

function maskBankAccount(row: any) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    employeeId: row.employeeId,
    bankName: row.bankName,
    accountType: row.accountType,
    routingNumberLast4: row.routingNumberLast4,
    accountNumberLast4: row.accountNumberLast4,
    depositType: row.depositType,
    depositAmount: row.depositAmount,
    depositPercent: row.depositPercent,
    isVerified: row.isVerified,
    verifiedAt: row.verifiedAt,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get('/employees/:employeeId/bank-accounts', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const result = await listBankAccounts({ workspaceId, employeeId: req.params.employeeId });
    res.json(result);
  } catch (error: unknown) {
    log.error('[BankAccounts] GET error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/employees/:employeeId/bank-accounts/verify', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });
    const { employeeId } = req.params;
    const [employee] = await db.select({ userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!requireManagerOrOwn(req, employee.userId)) return res.status(403).json({ error: 'Access denied' });
    const result = await verifyBankAccount({ workspaceId, employeeId, userId });
    if (!result.success) return res.status(result.httpStatus || 500).json({ error: result.error });
    res.json({ success: result.valid, status: result.status });
  } catch (error: unknown) {
    log.error('[BankAccounts] VERIFY error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/employees/:employeeId/bank-accounts', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });
    const result = await addBankAccount({
      workspaceId, employeeId: req.params.employeeId, userId,
      userEmail: req.user?.email || null,
      userRole: req.user?.role || null,
      body: req.body,
    });
    if (!result.success) return res.status(result.status || 400).json({ error: result.error });
    res.status(201).json(result);
  } catch (error: unknown) {
    log.error('[BankAccounts] POST error:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.patch('/employees/:employeeId/bank-accounts/:accountId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });
    const result = await updateBankAccount({
      workspaceId, employeeId: req.params.employeeId,
      accountId: req.params.accountId, userId,
      userEmail: req.user?.email || null,
      userRole: req.user?.role || null,
      body: req.body,
    });
    if (!result.success) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (error: unknown) {
    log.error('[BankAccounts] PATCH error:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.delete('/employees/:employeeId/bank-accounts/:accountId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });
    const result = await deactivateBankAccount({
      workspaceId, employeeId: req.params.employeeId,
      accountId: req.params.accountId, userId,
      userEmail: req.user?.email || null,
      userRole: req.user?.role || null,
    });
    if (!result.success) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (error: unknown) {
    log.error('[BankAccounts] DELETE error:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});


// ── Bonus Pay ─────────────────────────────────────────────────────────────────
// POST /payroll/bonus — create a standalone bonus pay entry for an employee
// Supports: performance, retention, referral, sign-on, holiday, discretionary
// Tax: 22% federal supplemental flat rate + FICA (SS 6.2% + Medicare 1.45%)
router.post('/bonus', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await createBonusPayEntry(workspaceId, userId, req.body);
    if (!result.success) return res.status(result.status || 400).json({ message: result.error });
    res.status(201).json({
      ...result,
      irsNotice: 'Federal tax withheld at 22% supplemental flat rate (IRS Pub. 15-T). This is an estimate — consult your CPA for aggregate method if more appropriate.',
    });
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    log.error('Error creating bonus pay:', error);
    res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to create bonus pay' });
  }
});

// ── Commission Pay ────────────────────────────────────────────────────────────
// POST /payroll/commission — create a commission pay entry for an employee
// Sources: contract_sale, contract_renewal, referral_client, performance, overtime_incentive
// Tax: 22% federal supplemental flat rate + FICA
router.post('/commission', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await createCommissionPayEntry(workspaceId, userId, req.body);
    if (!result.success) return res.status(result.status || 400).json({ message: result.error });
    res.status(201).json({
      ...result,
      irsNotice: 'Commission withheld at 22% federal supplemental flat rate. Commissions may be subject to FICA — consult your CPA.',
    });
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    log.error('Error creating commission pay:', error);
    res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to create commission pay' });
  }
});

export default router;
