import crypto from 'crypto';
import { sanitizeError } from '../middleware/errorHandler';
import { PLATFORM } from '../config/platformConfig';
import { validatePayrollPeriod, validateDeductionAmount, validateNonNegativeAmount, businessRuleResponse } from '../lib/businessRules';
import { Router } from "express";
import type { AuthenticatedRequest } from "../rbac";
import { sumFinancialValues, formatCurrency, toFinancialString } from '../services/financialCalculator';
import { platformEventBus } from '../services/platformEventBus';
import { hasManagerAccess, hasPlatformWideAccess } from "../rbac";
import PDFDocument from "pdfkit";
import { db } from "../db";
import { storage } from "../storage";
import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  payrollRuns,
  payrollEntries,
  payrollGarnishments,
  payStubs,
  employees,
  stagedShifts,
  employeePayrollInfo,
  employeeBankAccounts,
  timeEntries,
  billingAuditLog,
  payrollRunLocks,
} from '@shared/schema';
import { employeeOnboardingProgress } from '@shared/schema/domains/workforce/extended';
import { encryptToken, decryptToken } from '../security/tokenEncryption';
import * as taxCalculator from "../services/taxCalculator";
import { calculateStateTax, calculateBonusTaxation } from "../services/taxCalculator";
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
import { detectPayPeriod, createAutomatedPayrollRun } from "../services/payrollAutomation";
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
import { isTerminalPayrollStatus, isDraftPayrollStatus, isValidPayrollTransition, PAYROLL_TERMINAL_STATUSES, PAYROLL_DRAFT_STATUSES } from '../services/payroll/payrollStatus';
import { getPayrollTaxFilingDeadlines, getPayrollTaxFilingGuide, getPayrollStatePortals } from '../services/payroll/payrollTaxFilingGuideService';
import { buildPayrollCsvExport } from '../services/payroll/payrollCsvExportService';
import { rejectPayrollProposal } from '../services/payroll/payrollProposalRejectionService';
import { getMyPaychecks, getMyPayStub, getMyPayrollInfo, updateMyPayrollInfo, getYtdEarnings } from '../services/payroll/payrollEmployeeSelfServiceService';
import { listPayrollProposals, getPayrollProposal } from '../services/payroll/payrollProposalReadService';
import { getMyEmployeeTaxForms, getMyEmployeeTaxForm } from '../services/payroll/payrollEmployeeTaxFormsService';
import { listPayrollRuns, getPayrollRun } from '../services/payroll/payrollRunReadService';
import { deletePayrollRun } from '../services/payroll/payrollRunDeleteService';
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
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { payrollProposals } = await import("@shared/schema");

      // Phase 29 / Phase 27 guard: SELECT FOR UPDATE inside a transaction prevents
      // two concurrent managers from approving the same payroll proposal simultaneously.
      let proposal: any;
      let approvedProposal: any;
      try {
        ({ proposal, approvedProposal } = await db.transaction(async (tx) => {
          // Lock the row — concurrent requests wait here instead of racing
          const [locked] = await tx
            .select()
            .from(payrollProposals)
            .where(
              and(
                eq(payrollProposals.id, id),
                eq(payrollProposals.workspaceId, userWorkspace.workspaceId),
              )
            )
            .for('update')
            .limit(1);

          if (!locked) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

          if (locked.status !== 'pending') {
            throw Object.assign(new Error('ALREADY_PROCESSED'), { status: 409 });
          }

          // FIX [FOUR-EYES PAYROLL APPROVAL]: four-eyes check inside transaction so
          // it cannot be bypassed by a concurrent request that reads stale state.
          if (locked.createdBy && locked.createdBy === userId) {
            throw Object.assign(new Error('SELF_APPROVAL_FORBIDDEN'), { status: 403 });
          }

          // FIX [PAYROLL PROPOSAL STALENESS]: 30-day stale guard
          if (locked.createdAt) {
            const proposalAgeMs = Date.now() - new Date(locked.createdAt).getTime();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            if (proposalAgeMs > thirtyDaysMs) {
              throw Object.assign(new Error('PROPOSAL_EXPIRED'), {
                status: 409,
                extra: {
                  createdAt: locked.createdAt,
                  ageInDays: Math.floor(proposalAgeMs / (24 * 60 * 60 * 1000)),
                },
              });
            }
          }

          const [approved] = await tx.update(payrollProposals).set({
            status: 'approved',
            approvedBy: userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          }).where(and(
            eq(payrollProposals.id, id),
            eq(payrollProposals.status, 'pending'),
          )).returning();

          if (!approved) throw Object.assign(new Error('ALREADY_PROCESSED'), { status: 409 });

          return { proposal: locked, approvedProposal: approved };
        }));
      } catch (txErr: any) {
        const status = txErr?.status || 500;
        if (status === 404) return res.status(404).json({ message: "Proposal not found" });
        if (status === 409 && txErr?.message === 'ALREADY_PROCESSED') return res.status(409).json({ message: "Proposal was already processed by another user" });
        if (status === 403) return res.status(403).json({ message: "You cannot approve a payroll proposal that you created. A different authorised manager must approve it.", code: 'SELF_APPROVAL_FORBIDDEN' });
        if (status === 409 && txErr?.message === 'PROPOSAL_EXPIRED') return res.status(409).json({ message: "This payroll proposal is more than 30 days old and can no longer be approved. Please create a new proposal with current data.", code: 'PROPOSAL_EXPIRED', ...txErr?.extra });
        throw txErr;
      }

      if (!approvedProposal) {
        return res.status(409).json({ message: "Proposal was already processed by another user" });
      }

      // FIX 7: Financial anomaly check on payroll approval — non-blocking warning
      let payrollAnomalyWarning: string | null = null;
      const proposalData = (proposal as any).data ?? {};
      const payrollTotal = parseFloat(toFinancialString(proposalData.totalGross ?? proposalData.totalAmount ?? proposalData.total ?? '0')); // billing boundary
      const PAYROLL_ANOMALY_THRESHOLD = 100000;
      const PAYROLL_EXTREME_THRESHOLD = 500000;
      if (payrollTotal >= PAYROLL_EXTREME_THRESHOLD) {
        payrollAnomalyWarning = `EXTREME_PAYROLL: Total payroll $${payrollTotal.toLocaleString()} far exceeds normal range ($500k+). Verify with finance team before processing.`;
        log.warn(`[FinancialAnomaly] Payroll proposal ${id} total $${payrollTotal} ≥ $${PAYROLL_EXTREME_THRESHOLD} threshold`);
      } else if (payrollTotal >= PAYROLL_ANOMALY_THRESHOLD) {
        payrollAnomalyWarning = `HIGH_PAYROLL: Total payroll $${payrollTotal.toLocaleString()} is above typical range ($100k+). Please confirm this is correct.`;
        log.warn(`[FinancialAnomaly] Payroll proposal ${id} total $${payrollTotal} ≥ $${PAYROLL_ANOMALY_THRESHOLD} threshold`);
      }

      storage.createAuditLog({
        workspaceId: userWorkspace.workspaceId,
        userId: userId!,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'update',
        entityType: 'payroll_proposal',
        entityId: id,
        actionDescription: `Payroll proposal ${id} approved`,
        changes: { before: { status: 'pending' }, after: { status: 'approved', approvedBy: userId } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll proposal approval', { error: err?.message }));

      // Webhook Emission
      try {
        const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
        deliverWebhookEvent(userWorkspace.workspaceId, 'payroll.run_completed', {
          proposalId: id,
          approvedBy: userId,
          totalGross: (proposal as any).data?.totalGross,
          approvedAt: new Date().toISOString()
        });
      } catch (webhookErr: any) {
        log.warn('[Payroll] Failed to log webhook error to audit log', { error: webhookErr.message });
      }

      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { broadcastToWorkspace: bcastProposalApprove } = await import('../services/websocketService');
      bcastProposalApprove(userWorkspace.workspaceId, { type: 'payroll_updated', action: 'proposal_approved', proposalId: id });
      platformEventBus.publish({
        type: 'payroll_run_approved',
        category: 'automation',
        title: 'Payroll Proposal Approved',
        description: `Payroll proposal ${id} approved by ${userId} — payroll will be processed`,
        workspaceId: userWorkspace.workspaceId,
        userId: userId!,
        metadata: {
          proposalId: id,
          approvedBy: userId,
          source: 'proposal_approve',
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // Notify managers about payroll approval
      const { universalNotificationEngine } = await import('../services/universalNotificationEngine');
      await universalNotificationEngine.sendNotification({
        workspaceId: userWorkspace.workspaceId,
        type: 'payroll_approved',
        priority: 'high',
        title: 'Payroll Approved',
        message: `Payroll proposal ${id} has been approved and is moving to processing.`,
        severity: 'info',
        metadata: { proposalId: id, approvedBy: userId }
      }).catch(err => log.error('[Payroll] Failed to send approval notification:', (err instanceof Error ? err.message : String(err))));

      res.json({
        success: true,
        proposalId: id,
        message: 'Payroll proposal approved. Payroll will be processed.',
        ...(payrollAnomalyWarning ? { anomalyWarning: payrollAnomalyWarning } : {}),
      });
    } catch (error: unknown) {
      log.error("OperationsOS™ Payroll Approval Error:", error);
      res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to approve payroll" });
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

      // GAP-45 FIX: Block suspended/cancelled workspaces from creating payroll runs.
      // Invoice routes already guard this; payroll creation was missing the same check.
      // A workspace with subscriptionStatus='suspended' or 'cancelled' must NOT be able
      // to generate payroll — doing so would create financial obligations for an org that
      // has been administratively locked, creating reconciliation debt and audit exposure.
      const ws = await storage.getWorkspace(workspaceId);
      if (!ws || ws.subscriptionStatus === 'suspended' || ws.subscriptionStatus === 'cancelled') {
        return res.status(403).json({
          error: 'SUBSCRIPTION_INACTIVE',
          message: 'Organization subscription is not active — payroll cannot be run until the subscription is restored',
        });
      }

      const lockResult = await acquirePayrollRunLock(workspaceId, userId);
      if (!lockResult.acquired) {
        return res.status(409).json({ error: "A payroll run is already being created for this workspace", lockedBy: lockResult.holder });
      }

      // Validate input
      const schema = z.object({
        payPeriodStart: z.string().optional(),
        payPeriodEnd: z.string().optional(),
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(422).json({ 
          message: "Invalid request",
          errors: validationResult.error.errors
        });
      }

      const { payPeriodStart, payPeriodEnd } = validationResult.data;

      // Auto-detect pay period if not provided
      let periodStart: Date;
      let periodEnd: Date;
      
      if (payPeriodStart && payPeriodEnd) {
        periodStart = new Date(payPeriodStart);
        periodEnd = new Date(payPeriodEnd);
      } else {
        const detected = await detectPayPeriod(workspaceId);
        periodStart = detected.periodStart;
        periodEnd = detected.periodEnd;
      }

      const periodViolation = validatePayrollPeriod(periodStart, periodEnd);
      if (periodViolation) {
        await releasePayrollRunLock(workspaceId);
        if (businessRuleResponse(res, [periodViolation])) return;
      }

      // Check for overlapping runs
      const overlappingRun = await db.select().from(payrollRuns)
        .where(and(
          eq(payrollRuns.workspaceId, workspaceId),
          sql`(${payrollRuns.periodStart}, ${payrollRuns.periodEnd}) OVERLAPS (${periodStart.toISOString()}, ${periodEnd.toISOString()})`
        ))
        .limit(1);

      if (overlappingRun.length > 0) {
        await releasePayrollRunLock(workspaceId);
        return res.status(409).json({
          message: "Payroll period overlaps with an existing run",
          existingRunId: overlappingRun[0].id 
        });
      }

      // ── PRE-GATE: Workspace-wide compliance scan (runs regardless of approved hours) ──
      // Checks ALL active employees for guard card issues, missing onboarding, missing pay type.
      // Returns warnings even when payroll is blocked by ZERO_APPROVED_HOURS.
      const complianceWarnings: Array<{ employeeId: string; name: string; issue: string }> = [];
      try {
        const allWorkspaceEmployees = await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            onboardingStatus: employees.onboardingStatus,
            guardCardNumber: employees.guardCardNumber,
            guardCardExpiryDate: employees.guardCardExpiryDate,
            compliancePayType: employees.compliancePayType,
            licenseType: employees.licenseType,
            status: employees.status,
          })
          .from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            sql`${employees.status} NOT IN ('terminated', 'inactive')`
          ));
        const today = new Date();
        const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        for (const emp of allWorkspaceEmployees) {
          const name = `${emp.firstName} ${emp.lastName}`;
          if (emp.onboardingStatus !== 'completed') {
            complianceWarnings.push({ employeeId: emp.id, name, issue: 'Onboarding packet not completed — I-9/W-4 may be missing' });
          }
          if (!emp.guardCardNumber) {
            complianceWarnings.push({ employeeId: emp.id, name, issue: 'Guard card number not on file — required for licensed security work' });
          } else if (emp.guardCardExpiryDate) {
            const expiry = new Date(emp.guardCardExpiryDate);
            if (expiry < today) {
              complianceWarnings.push({ employeeId: emp.id, name, issue: `Guard card expired on ${expiry.toLocaleDateString()} — officer cannot legally work` });
            } else if (expiry < thirtyDaysOut) {
              complianceWarnings.push({ employeeId: emp.id, name, issue: `Guard card expires soon — ${expiry.toLocaleDateString()} (within 30 days)` });
            }
          }
          if (!emp.compliancePayType) {
            complianceWarnings.push({ employeeId: emp.id, name, issue: 'Pay classification (W-2/1099) not set — required for tax reporting' });
          }
        }
      } catch (compErr) {
        log.warn('[Payroll] Compliance pre-check failed (non-blocking):', (compErr as Error).message);
      }

      // ── FIX 2: HARD GATE — zero approved hours blocks payroll run creation ──
      // Reasoning audit Section 5 #2: was PARTIAL (deferred warning), now hard block.
      // complianceWarnings are included in the 400 response so the caller still gets them.
      const [approvedHoursCheck] = await db
        .select({ approvedCount: count(timeEntries.id) })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.status, 'approved'),
          gte(timeEntries.clockIn, periodStart),
          lte(timeEntries.clockIn, periodEnd),
        ));

      if (!approvedHoursCheck || approvedHoursCheck.approvedCount === 0) {
        await releasePayrollRunLock(workspaceId);
        return res.status(422).json({
          error: 'ZERO_APPROVED_HOURS',
          message: `No approved timesheets found for ${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}. Approve timesheets before running payroll.`,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          complianceWarnings,
        });
      }

      const payrollRun = await db.transaction(async (tx) => {
        const existingRun = await tx
          .select()
          .from(payrollRuns)
          .where(and(
            eq(payrollRuns.workspaceId, workspaceId),
            eq(payrollRuns.periodStart, periodStart),
            eq(payrollRuns.periodEnd, periodEnd),
          ))
          .for('update')
          .limit(1);

        if (existingRun.length > 0) {
          throw Object.assign(new Error(
            `A payroll run for this pay period (${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}) already exists.`
          ), {
            statusCode: 409,
            code: 'DUPLICATE_PAYROLL_RUN',
            existingRunId: existingRun[0].id,
            existingRunStatus: existingRun[0].status,
          });
        }

        return await createAutomatedPayrollRun({
          workspaceId,
          periodStart,
          periodEnd,
          createdBy: userId
        });
      });

      storage.createAuditLog({
        workspaceId,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'create',
        entityType: 'payroll_run',
        entityId: (payrollRun as any).id,
        actionDescription: `Payroll run created for period ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`,
        changes: { after: { payrollRunId: (payrollRun as any).id, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), status: 'pending' } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll run creation', { error: err?.message }));

      const periodStartStr = periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const periodEndStr = periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      notificationHelpers.createPayrollRunCreatedNotification(
        { storage, broadcastNotification },
        {
          workspaceId,
          userId,
          payrollRunId: (payrollRun as any).id,
          periodStart: periodStartStr,
          periodEnd: periodEndStr,
          createdBy: userId,
        }
      ).catch(err => log.error('Failed to create payroll notification:', err));

      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { broadcastToWorkspace: bcastRunCreated } = await import('../services/websocketService');
      bcastRunCreated(workspaceId, { type: 'payroll_updated', action: 'run_created', runId: (payrollRun as any).id });
      platformEventBus.publish({
        type: 'payroll_run_created',
        category: 'automation',
        title: 'Payroll Run Created',
        description: `Payroll run created for ${periodStartStr} – ${periodEndStr}`,
        workspaceId,
        userId,
        metadata: {
          payrollRunId: (payrollRun as any).id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          createdBy: userId,
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));


      // FIX-2: Financial audit log for payroll run creation
      await db.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'payroll_run_created',
        eventCategory: 'payroll',
        actorType: 'user',
        actorId: userId,
        actorEmail: req.user?.email || null,
        description: `Payroll run created for period ${periodStartStr} to ${periodEndStr}`,
        relatedEntityType: 'payroll_run',
        relatedEntityId: (payrollRun as any).id,
        newState: { status: (payrollRun as any).status, periodStart, periodEnd, totalGross: payrollRun.totalGrossPay },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      }).catch(err => log.error('[BillingAudit] billing_audit_log write failed for payroll create', { error: err?.message }));
      res.json({ ...payrollRun, complianceWarnings });
    } catch (error: unknown) {
      if (error instanceof Error && (error as any).code === 'DUPLICATE_PAYROLL_RUN') {
        return res.status(409).json({
          message: sanitizeError(error),
          code: (error as any).code,
          existingRunId: (error as any).existingRunId,
          existingRunStatus: (error as any).existingRunStatus,
        });
      }
      log.error("Error creating payroll run:", error);
      res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to create payroll run" });
    } finally {
      const workspaceId = req.workspaceId;
      if (workspaceId) await releasePayrollRunLock(workspaceId);
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
      if (!isValidPayrollTransition(currentStatus, 'approved')) {
        const lifecycleStatus = resolvePayrollLifecycleStatus(currentStatus);
        return res.status(422).json({
          message: "Only payroll runs pending review can be approved",
          currentStatus: lifecycleStatus || currentStatus,
        });
      }

      // FIX [GAP-11 FOUR-EYES RUN APPROVAL]: The manager who created the payroll run
      // (processedBy) must not be the same person who approves it. Without this check,
      // a single manager can create and immediately approve their own payroll run,
      // bypassing the two-person authorization requirement entirely.
      // This mirrors the same guard already in place for payroll proposals (line ~219).
      if (run.processedBy && run.processedBy === userId) {
        return res.status(403).json({
          message: "You cannot approve a payroll run that you created. A different authorized manager must approve it.",
          code: 'SELF_APPROVAL_FORBIDDEN',
        });
      }

      const updated = await storage.updatePayrollRunStatus(id, 'approved', userId, workspaceId);

      // GAP-42 FIX: Audit log write is now awaited, not fire-and-forget.
      // Previously, createAuditLog was called with .catch() — if the DB write failed,
      // the payroll run was approved with zero SOC2 audit trail. For a complianceTag:soc2
      // operation, a missing audit entry during an audit is a critical finding.
      // Now we await the write; on failure we log loudly but do NOT block the approval —
      // the payroll run IS correctly approved and the error is surfaced in structured logs
      // where it can be caught by the log monitoring pipeline for SOC2 audit alerting.
      try {
        await storage.createAuditLog({
          workspaceId,
          userId,
          userEmail: req.user?.email || 'unknown',
          userRole: req.user?.role || 'user',
          action: 'update',
          entityType: 'payroll_run',
          entityId: id,
          actionDescription: `Payroll run ${id} approved`,
          changes: { before: { status: 'pending' }, after: { status: 'approved', approvedBy: userId } },
          isSensitiveData: true,
          complianceTag: 'soc2',
        });
      } catch (err: unknown) {
        log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll approval', {
          runId: id,
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // FIX-2: Financial audit log for payroll approval
      try {
        await db.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'payroll_run_approved',
          eventCategory: 'payroll',
          actorType: 'user',
          actorId: userId,
          actorEmail: req.user?.email || null,
          description: `Payroll run ${run.id} approved for period ${run.periodStart} to ${run.periodEnd}`,
          relatedEntityType: 'payroll_run',
          relatedEntityId: id,
          previousState: { status: 'pending' },
          newState: { status: 'approved', approvedBy: userId, approvedAt: new Date().toISOString() },
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });
      } catch (err: unknown) {
        log.error('[BillingAudit] billing_audit_log write failed for payroll approval', {
          runId: id,
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      let qbSyncResult = null;
      try {
        const { onPayrollApproved } = await import('../services/financialPipelineOrchestrator');
        qbSyncResult = await onPayrollApproved(id, workspaceId, userId);
        log.info(`[PayrollApproval] QB sync result for payroll ${id}:`, qbSyncResult.action);
      } catch (syncError: unknown) {
        log.warn('[PayrollApproval] QB sync after approval failed (non-blocking):', (syncError instanceof Error ? syncError.message : String(syncError)));
      }

      // Real-time: update payroll dashboard for all managers in this workspace
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { broadcastToWorkspace } = await import('../services/websocketService');
        broadcastToWorkspace(workspaceId, { type: 'payroll_updated', action: 'approved', runId: run.id });
      } catch (_wsErr: any) {
        log.warn('[Payroll] Failed to broadcast WebSocket update', { error: _wsErr.message });
      }

      platformEventBus.publish({
        type: 'payroll_run_approved',
        category: 'automation',
        title: `Payroll Run Approved`,
        description: `Payroll run ${run.id} approved by manager — ready for processing`,
        workspaceId,
        userId,
        metadata: { payrollRunId: run.id, approvedBy: userId, runPeriod: run.periodStart + ' – ' + run.periodEnd },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.json({ ...updated, qbSync: qbSyncResult ? { synced: qbSyncResult.success, details: qbSyncResult.details } : undefined });
    } catch (error: unknown) {
      log.error("Error approving payroll run:", error);
      res.status(500).json({ message: "Failed to approve payroll run" });
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
        const { writeLedgerEntry } = await import('../services/orgLedgerService');
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
            const { users, workspaces } = await import('@shared/schema');
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
        const { broadcastToWorkspace } = await import('../services/websocketService');
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
      log.error("Error processing payroll run:", error);
      res.status(500).json({ message: "Failed to process payroll run" });
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

    const { taxFormGeneratorService } = await import('../services/taxFormGeneratorService');
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

    const currentYear = new Date().getFullYear();
    const priorYear = currentYear - 1;
    const taxYear = req.query.taxYear ? parseInt(req.query.taxYear as string, 10) : priorYear;

    // 1. Classify employees (W-2 vs 1099) for the current roster
    const roster = await db
      .select({
        id: employees.id,
        workerType: employees.workerType,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

    const w2Employees = roster.filter(e => (e.workerType || 'employee') !== 'contractor');
    const contractorRoster = roster.filter(e => (e.workerType || 'employee') === 'contractor');

    // 2. Scan prior-year payroll totals for contractors and find $600+ candidates
    const FORM_1099_THRESHOLD = 600;
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59);

    let contractorsAbove600 = 0;
    const contractorDetails: Array<{ employeeId: string; name: string; totalPaid: number; requiresFiling: boolean }> = [];

    for (const contractor of contractorRoster) {
      try {
        const totals = await db
          .select({ totalPaid: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)` })
          .from(payrollEntries)
          .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
          .where(
            and(
              eq(payrollEntries.employeeId, contractor.id),
              eq(payrollRuns.workspaceId, workspaceId),
              gte(payrollRuns.periodStart, yearStart),
              lte(payrollRuns.periodEnd, yearEnd),
            )
          );
        const totalPaid = parseFloat(totals[0]?.totalPaid || '0');
        const requiresFiling = totalPaid >= FORM_1099_THRESHOLD;
        if (requiresFiling) contractorsAbove600 += 1;
        contractorDetails.push({
          employeeId: contractor.id,
          name: `${contractor.firstName || ''} ${contractor.lastName || ''}`.trim(),
          totalPaid,
          requiresFiling,
        });
      } catch (err: unknown) {
        log.warn('Tax center contractor total calc failed', { employeeId: contractor.id });
      }
    }

    // 3. Generated forms for the tax year
    const { employeeTaxForms } = await import('@shared/schema');
    const forms = await db
      .select()
      .from(employeeTaxForms)
      .where(
        and(
          eq(employeeTaxForms.workspaceId, workspaceId),
          eq(employeeTaxForms.taxYear, taxYear),
        )
      );
    const w2sGenerated = forms.filter(f => f.formType === 'w2').length;
    const form1099sGenerated = forms.filter(f => f.formType === '1099').length;

    // 4. Deadlines
    const { taxFilingAssistanceService } = await import('../services/taxFilingAssistanceService');
    const deadlines = taxFilingAssistanceService.getFilingDeadlines(taxYear);

    // 5. Fees — pull tier discount and compute
    const tierId = (await getWorkspaceTier(workspaceId)) as any;
    const { getMiddlewareFees } = await import('@shared/billingConfig');
    const fees = getMiddlewareFees(tierId);
    const w2PerFormDollars = fees.taxForms.w2PerFormCents / 100;
    const form1099PerFormDollars = fees.taxForms.form1099PerFormCents / 100;

    return res.json({
      taxYear,
      employees: {
        w2Count: w2Employees.length,
        total1099Count: contractorRoster.length,
        contractorsAbove600,
        contractorDetails,
      },
      forms: {
        w2sGenerated,
        form1099sGenerated,
        w2sExpected: w2Employees.length,
        form1099sExpected: contractorsAbove600,
      },
      deadlines,
      filingGuides: {
        w2:       { url: 'https://www.ssa.gov/employer',              label: 'SSA Business Services Online' },
        form1099: { url: 'https://www.irs.gov/filing/e-file-providers', label: 'IRS FIRE System' },
        form941:  { url: 'https://www.eftps.gov',                     label: 'Electronic Federal Tax System (EFTPS)' },
        texasTWC: { url: 'https://apps.twc.state.tx.us',              label: 'Texas Workforce Commission' },
      },
      fees: {
        w2PerForm: w2PerFormDollars,
        form1099PerForm: form1099PerFormDollars,
        tierDiscountPercent: fees.tierDiscount,
        estimatedTotal: +(w2Employees.length * w2PerFormDollars + contractorsAbove600 * form1099PerFormDollars).toFixed(2),
      },
      disclaimer: `${PLATFORM.name} is middleware — we generate and deliver tax forms but do not file them with the IRS, SSA, or state agencies. Verify all figures with your CPA or tax professional before filing.`,
    });
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
      const { tokenManager } = await import('../services/billing/tokenManager');
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

    const { taxFormGeneratorService } = await import('../services/taxFormGeneratorService');
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

    const { taxFormGeneratorService } = await import('../services/taxFormGeneratorService');
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
      const { tokenManager } = await import('../services/billing/tokenManager');
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

    const { taxFormGeneratorService } = await import('../services/taxFormGeneratorService');

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
      const { tokenManager } = await import('../services/billing/tokenManager');
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

    const { taxFormGeneratorService } = await import('../services/taxFormGeneratorService');
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

    const { taxFormGeneratorService } = await import('../services/taxFormGeneratorService');
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

      const { executeInternalPayroll } = await import('../services/payrollAutomation');
      const result = await executeInternalPayroll(workspaceId, id, userId);

      if (result.processedEntries > 0) {
        try {
          const { tokenManager } = await import('../services/billing/tokenManager');
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

    const { runId } = req.params;
    const parsed = payrollVoidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'A reason is required to void a payroll run', details: parsed.error.flatten() });
    const { reason } = parsed.data;

    const { voidPayrollRun } = await import('../services/payrollAutomation');
    const result = await voidPayrollRun(runId, workspaceId, userId, reason.trim());

    if (!result.success) {
      return res.status(422).json({ message: result.error });
    }

    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'payroll_run',
      entityId: runId,
      actionDescription: `Payroll run ${runId} voided: ${reason}`,
      changes: { after: { status: 'voided', reason, voidedBy: userId } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll void', { error: err?.message }));

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { broadcastToWorkspace: bcastVoid } = await import('../services/websocketService');
    bcastVoid(workspaceId, { type: 'payroll_updated', action: 'voided', runId });
    platformEventBus.publish({
      type: 'payroll_run_voided',
      category: 'automation',
      title: 'Payroll Run Voided',
      description: `Payroll run ${runId} voided by ${userId} — reason: ${reason}`,
      workspaceId,
      userId,
      metadata: {
        payrollRunId: runId,
        voidedBy: userId,
        reason,
        source: 'payroll_void',
      },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true, message: 'Payroll run voided successfully' });
  } catch (error: unknown) {
    log.error('Error voiding payroll run:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to void payroll run' });
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
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // ACH payroll is a Professional-tier feature — gate here at service layer
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const tier = await getWorkspaceTier(workspaceId);
    if (!hasTierAccess(tier, 'professional')) {
      return res.status(402).json({ error: 'ACH payroll requires the Professional plan or higher', currentTier: tier, minimumTier: 'professional', requiresTierUpgrade: true });
    }

    const { id: runId } = req.params;
    const parsed = payrollMarkPaidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid mark-paid payload', details: parsed.error.flatten() });
    const { disbursementMethod = 'ach', notes } = parsed.data;

    const run = await storage.getPayrollRun(runId, workspaceId);
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const currentStatus = run.status ?? 'draft';
    if (!isValidPayrollTransition(currentStatus, 'paid')) {
      const lifecycleStatus = resolvePayrollLifecycleStatus(currentStatus);
      return res.status(422).json({
        message: `Only processing payroll runs can be marked as paid. Current status: ${lifecycleStatus || currentStatus}`,
      });
    }

    const updated = await storage.updatePayrollRunStatus(runId, 'paid', userId, workspaceId);
    if (!updated) {
      return res.status(409).json({ message: 'Payroll run status could not be updated — concurrent modification detected' });
    }

    // Bulk-stamp disbursedAt and disbursementMethod on all payroll entries for this run
    const now = new Date();
    await db.update(payrollEntries)
      .set({
        disbursedAt: now,
        disbursementMethod,
      })
      .where(and(
        eq(payrollEntries.payrollRunId, runId),
        eq(payrollEntries.workspaceId, workspaceId),
      ));

    try {
      const { writeLedgerEntry } = await import('../services/orgLedgerService');
      await writeLedgerEntry({
        workspaceId,
        entryType: 'payroll_disbursed',
        direction: 'credit',
        // G14 FIX: use ?? not || — totalNetPay of 0 (fully garnished) must record as 0 in the ledger
        amount: parseFloat(String(run.totalNetPay ?? run.totalGrossPay ?? 0)),
        relatedEntityType: 'payroll_run',
        relatedEntityId: runId,
        payrollRunId: runId,
        description: `Payroll run ${runId.substring(0, 8)} disbursed via ${disbursementMethod.toUpperCase()} — confirmed by ${req.user?.email || userId}${notes ? ` — ${notes}` : ''}`,
        createdBy: userId,
        metadata: { disbursementMethod, confirmedBy: userId, notes },
      });
    } catch (ledgerErr: unknown) {
      log.error('[PayrollRoute] Ledger write failed on mark-paid:', (ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)));
    }

    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'payroll_run',
      entityId: runId,
      actionDescription: `Payroll run ${runId} marked as paid via ${disbursementMethod}`,
      changes: { before: { status: 'processed' }, after: { status: 'paid', disbursementMethod, confirmedBy: userId } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll mark-paid', { error: err?.message }));

      // FIX-2: Financial audit log for payroll disbursement
      await db.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'payroll_run_paid',
        eventCategory: 'payroll',
        actorType: 'user',
        actorId: userId,
        actorEmail: req.user?.email || null,
        description: `Payroll run marked as paid via ${disbursementMethod}`,
        relatedEntityType: 'payroll_run',
        relatedEntityId: runId,
        previousState: { status: 'processed' },
        newState: { status: 'paid', disbursementMethod, disbursedAt: now.toISOString(), confirmedBy: userId },
        metadata: { notes, totalNetPay: run.totalNetPay, totalGrossPay: run.totalGrossPay },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      }).catch(err => log.error('[BillingAudit] billing_audit_log write failed for payroll mark-paid', { error: err?.message }));

    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { broadcastToWorkspace } = await import('../services/websocketService');
      broadcastToWorkspace(workspaceId, {
        type: 'payroll_updated',
        action: 'paid',
        runId,
        disbursementMethod,
      });
    } catch (err: any) {
      log.warn('[Payroll] Failed to process batch completion', { error: err.message });
    }

    platformEventBus.publish({
      type: 'payroll_run_paid',
      category: 'automation',
      title: `Payroll Disbursed`,
      description: `Payroll run ${runId} marked as paid — funds disbursed via ${disbursementMethod}`,
      workspaceId,
      userId,
      metadata: { payrollRunId: runId, disbursementMethod, confirmedBy: userId, paidAt: new Date().toISOString() },
      visibility: 'manager',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      runId,
      status: 'paid',
      disbursementMethod,
      confirmedBy: userId,
      message: 'Payroll run marked as paid. Disbursement confirmed.',
    });
  } catch (error: unknown) {
    log.error('[PayrollRoute] Error marking payroll run as paid:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to mark payroll run as paid' });
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

    // ACH transfer retries are a Professional-tier feature
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const tier = await getWorkspaceTier(workspaceId);
    if (!hasTierAccess(tier, 'professional')) {
      return res.status(402).json({ error: 'ACH payroll requires the Professional plan or higher', currentTier: tier, minimumTier: 'professional', requiresTierUpgrade: true });
    }

    const { id: runId } = req.params;

    // Verify run exists and belongs to workspace
    const run = await storage.getPayrollRun(runId, workspaceId);
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    // Get all failed/poll_failed pay stubs for this run
    const failedStubs = await db.select()
      .from(payStubs)
      .where(and(
        eq(payStubs.payrollRunId, runId),
        eq(payStubs.workspaceId, workspaceId),
        sql`${payStubs.plaidTransferStatus} IN ('failed', 'poll_failed', 'returned')`,
      ));

    if (failedStubs.length === 0) {
      return res.status(400).json({ message: 'No failed transfers found for this payroll run' });
    }

    const { initiatePayrollAchTransfer } = await import('../services/payroll/achTransferService');

    const results: { stubId: string; employeeId: string; status: 'retried' | 'skipped' | 'failed'; transferId?: string; reason?: string }[] = [];

    for (const stub of failedStubs) {
      try {
        const empId = stub.employeeId;
        const netPay = parseFloat(String(stub.netPay ?? 0));
        const transferResult = await initiatePayrollAchTransfer({
          workspaceId,
          employeeId: empId,
          payrollRunId: runId,
          payrollEntryId: stub.payrollEntryId || null,
          payStubId: stub.id,
          amount: netPay,
          idempotencyKey: `retry-${stub.id}`,
          description: 'Payroll Retry',
          legalName: empId,
        });

        if (transferResult.status === 'initiated') {
          platformEventBus.publish({
            type: 'payroll_transfer_initiated' as any,
            category: 'payroll',
            title: 'ACH Transfer Retry Initiated',
            description: `Retry transfer ${transferResult.transferId} initiated for employee ${empId}`,
            workspaceId,
            userId,
            metadata: { payrollRunId: runId, employeeId: empId, transferId: transferResult.transferId, amount: netPay, isRetry: true },
            visibility: 'manager',
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

          results.push({ stubId: stub.id, employeeId: empId, status: 'retried', transferId: transferResult.transferId });
          continue;
        }

        if (transferResult.status === 'payment_held') {
          results.push({ stubId: stub.id, employeeId: empId, status: 'skipped', reason: transferResult.reason || 'PAYMENT_HELD' });
          continue;
        }

        if (transferResult.status === 'skipped') {
          results.push({ stubId: stub.id, employeeId: empId, status: 'skipped', reason: transferResult.reason || 'Transfer skipped' });
          continue;
        }

        results.push({ stubId: stub.id, employeeId: empId, status: 'failed', reason: transferResult.reason || 'Transfer failed' });
      } catch (err: unknown) {
        results.push({ stubId: stub.id, employeeId: stub.employeeId, status: 'failed', reason: (err instanceof Error ? err.message : String(err)) });
      }
    }

    const retriedCount = results.filter(r => r.status === 'retried').length;
    res.json({
      success: true,
      runId,
      totalFailed: failedStubs.length,
      retriedCount,
      skippedCount: results.filter(r => r.status === 'skipped').length,
      errorCount: results.filter(r => r.status === 'failed').length,
      results,
    });
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

    const { amendPayrollEntry } = await import('../services/payrollAutomation');
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
    if (!roleCheck.allowed) {
      return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const { runId } = req.params;

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.workspaceId, workspaceId)))
      .limit(1);

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const entries = await db.select({
      id: payrollEntries.id,
      employeeId: payrollEntries.employeeId,
      regularHours: payrollEntries.regularHours,
      overtimeHours: payrollEntries.overtimeHours,
      hourlyRate: payrollEntries.hourlyRate,
      grossPay: payrollEntries.grossPay,
      federalTax: payrollEntries.federalTax,
      stateTax: payrollEntries.stateTax,
      socialSecurity: payrollEntries.socialSecurity,
      medicare: payrollEntries.medicare,
      netPay: payrollEntries.netPay,
      workerType: payrollEntries.workerType,
    }).from(payrollEntries)
      .where(and(
        eq(payrollEntries.payrollRunId, runId),
        eq(payrollEntries.workspaceId, workspaceId),
      ));

    const workspace = await storage.getWorkspace(workspaceId);
    const { employees: employeesTable } = await import('@shared/schema');
    const empList = await db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName })
      .from(employeesTable)
      .where(eq(employeesTable.workspaceId, workspaceId));
    const empMap = new Map(empList.map(e => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-run-${format(run.periodStart || new Date(), 'yyyy-MM-dd')}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text(workspace?.companyName || 'Company', { align: 'center' });
    doc.fontSize(14).text('PAYROLL RUN SUMMARY', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(
      `Pay Period: ${format(new Date(run.periodStart || new Date()), 'MMMM d, yyyy')} – ${format(new Date(run.periodEnd || new Date()), 'MMMM d, yyyy')}`,
      { align: 'center' },
    );
    doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`, { align: 'center' });
    doc.text(`Status: ${(run.status || '').toUpperCase()}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text('EMPLOYEE BREAKDOWN', { underline: true });
    doc.moveDown(0.3);

    const colX = { name: 50, hours: 220, rate: 290, gross: 360, taxes: 420, net: 490 };
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Employee', colX.name, doc.y, { continued: false });
    const headerY = doc.y - 12;
    doc.text('Reg Hrs', colX.hours, headerY, { continued: false });
    doc.text('Rate', colX.rate, headerY, { continued: false });
    doc.text('Gross', colX.gross, headerY, { continued: false });
    doc.text('Taxes', colX.taxes, headerY, { continued: false });
    doc.text('Net Pay', colX.net, headerY, { continued: false });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9);

    for (const entry of entries) {
      const name = empMap.get(entry.employeeId) || 'Unknown';
      const taxes = (parseFloat(entry.federalTax || '0') + parseFloat(entry.stateTax || '0') +
        parseFloat(entry.socialSecurity || '0') + parseFloat(entry.medicare || '0')).toFixed(2);
      const rowY = doc.y;
      doc.text(name, colX.name, rowY, { width: 165, continued: false });
      doc.text(`${parseFloat(entry.regularHours || '0').toFixed(1)}`, colX.hours, rowY);
      doc.text(`$${parseFloat(entry.hourlyRate || '0').toFixed(2)}`, colX.rate, rowY);
      doc.text(`$${parseFloat(entry.grossPay || '0').toFixed(2)}`, colX.gross, rowY);
      doc.text(`$${taxes}`, colX.taxes, rowY);
      doc.text(`$${parseFloat(entry.netPay || '0').toFixed(2)}`, colX.net, rowY);
      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Total Employees: ${entries.length}`, 50);
    doc.text(`Total Gross Pay: $${parseFloat(run.totalGrossPay || '0').toFixed(2)}`, 50);
    doc.text(`Total Taxes: $${(parseFloat(run.totalTaxes || '0')).toFixed(2)}`, 50);
    doc.text(`Total Net Pay: $${parseFloat(run.totalNetPay || '0').toFixed(2)}`, 50);

    doc.moveDown();
    doc.fontSize(8).font('Helvetica').fillColor('grey')
      .text('This document is confidential. Generated by Trinity Payroll Automation.', { align: 'center' });

    doc.end();
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
    if (!roleCheck.allowed) {
      return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const { invoices: invoicesTable, clients } = await import('@shared/schema');
    const { eq: eqI, and: andI, inArray: inArrayI, sql: sqlI } = await import('drizzle-orm');

    const workspace = await storage.getWorkspace(workspaceId);
    const blob = (workspace?.billingSettingsBlob as any) || {};
    const cycle = blob.payrollCycle || 'bi-weekly';

    const { startOfWeek, endOfWeek, subDays: subDaysI, startOfMonth, endOfMonth } = await import('date-fns');
    const now = new Date();

    let periodStart: Date;
    let periodEnd: Date;
    if (cycle === 'weekly') {
      periodStart = startOfWeek(now, { weekStartsOn: 0 });
      periodEnd = endOfWeek(now, { weekStartsOn: 0 });
    } else if (cycle === 'monthly') {
      periodStart = startOfMonth(now);
      periodEnd = endOfMonth(now);
    } else {
      const twoWeeksAgo = subDaysI(now, 13);
      // FIX [GAP-2 UTC REGRESSION]: Use setUTCHours not setHours — local-time midnight
      // produces inconsistent period boundaries across timezones, breaking bi-weekly period
      // calculations in the same way the Phase 11 UTC fix corrected the canonical period detector.
      twoWeeksAgo.setUTCHours(0, 0, 0, 0);
      periodStart = twoWeeksAgo;
      periodEnd = now;
    }

    const outstandingInvoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientId: invoicesTable.clientId,
        total: invoicesTable.total,
        status: invoicesTable.status,
        dueDate: invoicesTable.dueDate,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .where(andI(
        eqI(invoicesTable.workspaceId, workspaceId),
        sqlI`${invoicesTable.status} IN ('draft', 'sent')`,
        sqlI`${invoicesTable.createdAt} >= ${periodStart}`,
        sqlI`${invoicesTable.createdAt} <= ${periodEnd}`,
      ));

    const clientIds = [...new Set(outstandingInvoices.map(i => i.clientId).filter(Boolean))];
    const clientMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const clientRows = await db.select({ id: clients.id, companyName: clients.companyName })
        .from(clients).where(inArrayI(clients.id, clientIds));
      for (const c of clientRows) clientMap.set(c.id, c.companyName || 'Unknown');
    }

    const totalOutstanding = outstandingInvoices.reduce((s, i) => s + parseFloat(i.total), 0);
    const unsentDrafts = outstandingInvoices.filter(i => i.status === 'draft');
    const sentUnpaid = outstandingInvoices.filter(i => i.status === 'sent');

    const [payrollObligation] = await db
      .select({ total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}), 0)` })
      .from(payrollRuns)
      .where(andI(
        eqI(payrollRuns.workspaceId, workspaceId),
        sqlI`${payrollRuns.status} IN ('draft', 'pending')`,
      ));

    res.json({
      payPeriod: { start: periodStart.toISOString(), end: periodEnd.toISOString(), cycle },
      payrollObligation: parseFloat(payrollObligation?.total || '0'),
      outstandingInvoices: outstandingInvoices.map(i => ({
        ...i,
        clientName: clientMap.get(i.clientId) || 'Unknown',
        amount: parseFloat(i.total),
      })),
      summary: {
        totalOutstanding,
        unsentDrafts: unsentDrafts.length,
        sentUnpaid: sentUnpaid.length,
        totalCount: outstandingInvoices.length,
      },
      recommendation: unsentDrafts.length > 0
        ? `You have ${unsentDrafts.length} unsent draft invoice${unsentDrafts.length === 1 ? '' : 's'} totaling $${unsentDrafts.reduce((s, i) => s + parseFloat(i.total), 0).toFixed(2)}. Consider sending them before approving payroll to ensure cash is on the way.`
        : totalOutstanding > 0
          ? `You have ${sentUnpaid.length} outstanding invoice${sentUnpaid.length === 1 ? '' : 's'} awaiting payment. Monitor collections before payroll disbursement.`
          : 'All invoices for this period are settled. You are clear to approve payroll.',
    });
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
    const { id: runId } = req.params;

    const run = await storage.getPayrollRun(runId, workspaceId);
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!isTerminalPayrollStatus(run.status)) {
      return res.status(400).json({ message: 'NACHA file is only available for processed or paid payroll runs' });
    }

    const { workspaces: wsTable } = await import('@shared/schema');
    const [ws] = await db.select({
      name: wsTable.name,
      companyName: (wsTable as any).companyName,
      payrollBankRouting: (wsTable as any).payrollBankRouting,
      payrollBankAccount: (wsTable as any).payrollBankAccount,
      payrollBankName: (wsTable as any).payrollBankName,
    }).from(wsTable).where(eq(wsTable.id, workspaceId)).limit(1);

    const entries = await db.select({
      employeeId: payrollEntries.employeeId,
      netPay: payrollEntries.netPay,
      directDepositEnabled: employeePayrollInfo.directDepositEnabled,
      routingNumber: employeePayrollInfo.bankRoutingNumber,
      accountNumber: employeePayrollInfo.bankAccountNumber,
      accountType: employeePayrollInfo.bankAccountType,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
      .from(payrollEntries)
      .leftJoin(employeePayrollInfo, eq(payrollEntries.employeeId, employeePayrollInfo.employeeId))
      .leftJoin(employees, eq(payrollEntries.employeeId, employees.id))
      .where(and(eq(payrollEntries.workspaceId, workspaceId), eq(payrollEntries.payrollRunId, runId)));

    // ACH COMPLIANCE: Decrypt routing/account numbers — fields are AES-256-GCM encrypted at rest.
    // safeDecrypt falls back to raw value for any legacy plaintext rows (migration safety).
    function safeDecrypt(value: string | null | undefined): string | null {
      if (!value) return null;
      try { return decryptToken(value); } catch { return value; }
    }

    // For each entry, prefer the canonical employee_bank_accounts record (encrypted), then fall back to employee_payroll_info
    const employeeIds = entries.map(e => (e as any).employeeId).filter(Boolean);
    const bankAccountRows = employeeIds.length > 0
      ? await db.select().from(employeeBankAccounts)
          .where(and(
            sql`${employeeBankAccounts.employeeId} = ANY(ARRAY[${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
            eq(employeeBankAccounts.isPrimary, true),
            eq(employeeBankAccounts.isActive, true)
          ))
      : [];
    const bankAccountMap = new Map(bankAccountRows.map(r => [r.employeeId, r]));

    const decryptedEntries = entries.map(e => {
      const canonical = bankAccountMap.get((e as any).employeeId);
      if (canonical?.routingNumberEncrypted && canonical?.accountNumberEncrypted) {
        return {
          ...e,
          routingNumber: safeDecrypt(canonical.routingNumberEncrypted),
          accountNumber: safeDecrypt(canonical.accountNumberEncrypted),
          accountType: canonical.accountType || e.accountType,
        };
      }
      return {
        ...e,
        routingNumber: safeDecrypt(e.routingNumber as string | null),
        accountNumber: safeDecrypt(e.accountNumber as string | null),
      };
    });

    const eligible = decryptedEntries.filter(e => e.directDepositEnabled && e.routingNumber && e.accountNumber);
    const missing = decryptedEntries.filter(e => !e.directDepositEnabled || !e.routingNumber || !e.accountNumber);

    if (eligible.length === 0) {
      return res.status(422).json({
        message: 'No employees have direct deposit configured for this payroll run',
        missingCount: missing.length,
        hint: 'Ensure employees have bank routing/account numbers set in their payroll profile',
      });
    }

    // Build a proper NACHA ACH PPD file
    const companyName = ((ws as any)?.companyName || (ws as any)?.name || 'COMPANY').substring(0, 16).padEnd(16, ' ');
    const originRoutingRaw = (ws as any)?.payrollBankRouting || '000000000';
    // NACHA routing number: leading digit '1' + 8-digit bank routing = 9 chars
    const originRouting = `1${originRoutingRaw.replace(/\D/g, '').substring(0, 8).padEnd(8, '0')}`;
    const originAccount = ((ws as any)?.payrollBankAccount || '00000000000').replace(/\D/g, '').substring(0, 17).padEnd(17, ' ');
    const now = new Date();
    const fileDate = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const fileTime = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM
    const batchCount = 1;
    const fileIdModifier = 'A';
    const blockingFactor = 10;
    const formatCode = '1';
    const totalDebitCents = 0;
    const totalCreditCents = eligible.reduce((sum, e) => sum + Math.round(Number(e.netPay) * 100), 0);

    const pad = (s: string | number, len: number, right = false) => {
      const str = String(s);
      return right ? str.substring(0, len).padEnd(len, ' ') : str.substring(0, len).padStart(len, '0');
    };

    // File Header Record (1)
    const fileHeader = [
      '1', // Record Type
      '01', // Priority Code
      pad(originRouting, 10), // Immediate Destination
      pad(originRouting.replace(/\D/g, '').padEnd(10, '0'), 10), // Immediate Origin
      fileDate, // File Creation Date (YYMMDD)
      fileTime, // File Creation Time (HHMM)
      fileIdModifier, // File ID Modifier
      '094', // Record Size
      String(blockingFactor), // Blocking Factor
      formatCode, // Format Code
      companyName.padEnd(23, ' '), // Immediate Destination Name
      companyName.padEnd(23, ' '), // Immediate Origin Name
      '        ', // Reference Code
    ].join('');

    // Batch Header Record (5)
    const batchHeader = [
      '5', // Record Type
      '200', // Service Class Code (200 = mixed debits/credits, 220 = credits only)
      companyName.padEnd(16, ' '), // Company Name
      '          ', // Company Discretionary Data
      originRouting.replace(/\D/g, '').padStart(10, '0'), // Company Identification
      'PPD', // Standard Entry Class Code (PPD = Prearranged Payment and Deposit)
      'PAYROLL         ', // Company Entry Description
      fileDate, // Company Descriptive Date
      fileDate, // Effective Entry Date
      '   ', // Settlement Date (filled by bank)
      '1', // Originator Status Code
      originRouting, // Originating DFI Identification
      pad(batchCount, 7), // Batch Number
    ].join('');

    // Entry Detail Records (6)
    const entryLines: string[] = [];
    let traceSeq = 1;
    for (const e of eligible) {
      const txCode = e.accountType === 'savings' ? '32' : '22'; // 22=checking credit, 32=savings credit
      const routingRaw = (e.routingNumber || '').replace(/\D/g, '').padEnd(8, '0');
      const checkDigit = (e.routingNumber || '0').slice(-1);
      const accountNum = (e.accountNumber || '').padEnd(17, ' ').substring(0, 17);
      const amountCents = Math.round(Number(e.netPay) * 100);
      const employeeName = `${e.firstName || ''} ${e.lastName || ''}`.trim().substring(0, 22).padEnd(22, ' ');
      const traceNum = `${originRouting.slice(1, 9)}${pad(traceSeq++, 7)}`;

      entryLines.push([
        '6', // Record Type
        txCode, // Transaction Code
        `${routingRaw}${checkDigit}`, // Receiving DFI Routing Transit Number (8 + check digit)
        accountNum, // DFI Account Number
        pad(amountCents, 10), // Amount (cents, no decimal)
        e.employeeId.substring(0, 15).padEnd(15, ' '), // Individual Identification Number
        employeeName, // Individual Name
        '  ', // Discretionary Data
        '0', // Addenda Record Indicator
        traceNum, // Trace Number (15 digits)
      ].join(''));
    }

    // Batch Control Record (8)
    const entryAddendaCount = entryLines.length;
    const entryHash = eligible
      .reduce((sum, e) => sum + parseInt((e.routingNumber || '0').replace(/\D/g, '').substring(0, 8), 10), 0)
      .toString().slice(-10).padStart(10, '0');

    const batchControl = [
      '8', // Record Type
      '220', // Service Class Code
      pad(entryAddendaCount, 6), // Entry/Addenda Count
      entryHash, // Entry Hash
      pad(totalDebitCents, 12), // Total Debit Entry Dollar Amount
      pad(totalCreditCents, 12), // Total Credit Entry Dollar Amount
      originRouting.replace(/\D/g, '').padStart(10, '0'), // Company Identification
      ' '.repeat(39), // Message Authentication Code + Reserved
      originRouting.slice(1, 9), // Originating DFI Identification
      pad(batchCount, 7), // Batch Number
    ].join('');

    // File Control Record (9)
    const blockCount = Math.ceil((2 + 2 + entryLines.length) / blockingFactor);
    const fileControl = [
      '9', // Record Type
      pad(batchCount, 6), // Batch Count
      pad(blockCount, 6), // Block Count
      pad(entryAddendaCount, 8), // Entry/Addenda Count
      entryHash, // Entry Hash
      pad(totalDebitCents, 12), // Total Debit
      pad(totalCreditCents, 12), // Total Credit
      ' '.repeat(39), // Reserved
    ].join('');

    // Pad file to multiple of 10 records (9 filler lines)
    const records = [fileHeader, batchHeader, ...entryLines, batchControl, fileControl];
    const totalRecords = records.length;
    const paddedTo = Math.ceil(totalRecords / 10) * 10;
    for (let i = totalRecords; i < paddedTo; i++) {
      records.push('9'.repeat(94));
    }

    const nachaContent = records.map(r => r.substring(0, 94)).join('\r\n');
    const periodLabel = run.periodStart
      ? new Date(run.periodStart).toISOString().slice(0, 10).replace(/-/g, '')
      : fileDate;
    const filename = `payroll-ach-${periodLabel}-${runId.substring(0, 8)}.ach`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-NACHA-Entries', String(eligible.length));
    res.setHeader('X-NACHA-Missing', String(missing.length));
    res.setHeader('X-NACHA-Total-Cents', String(totalCreditCents));

    return res.send(nachaContent);
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
    const { employeeId } = req.params;

    const rows = await db.select().from(employeeBankAccounts)
      .where(and(eq(employeeBankAccounts.workspaceId, workspaceId), eq(employeeBankAccounts.employeeId, employeeId), eq(employeeBankAccounts.isActive, true)))
      .orderBy(desc(employeeBankAccounts.isPrimary));

    res.json({ success: true, bankAccounts: rows.map(maskBankAccount) });
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

    if (!requireManagerOrOwn(req, employee.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { verifyEmployeeBankAccount } = await import('../services/payroll/achTransferService');
    const verification = await verifyEmployeeBankAccount({
      workspaceId,
      employeeId,
      verifiedBy: userId,
    });

    res.json({ success: verification.valid, status: verification.status });
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
    const { employeeId } = req.params;

    const parsed = employeeBankAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid bank account data', details: parsed.error.flatten() });
    const { bankName, routingNumber, accountNumber, accountType, depositType, depositAmount, depositPercent, isPrimary, notes } = parsed.data;

    const encryptedRouting = encryptToken(String(routingNumber).trim());
    const encryptedAccount = encryptToken(String(accountNumber).trim());
    const routingLast4 = String(routingNumber).trim().slice(-4);
    const accountLast4 = String(accountNumber).trim().slice(-4);

    if (isPrimary) {
      await db.update(employeeBankAccounts).set({ isPrimary: false })
        .where(and(eq(employeeBankAccounts.workspaceId, workspaceId), eq(employeeBankAccounts.employeeId, employeeId)));
    }

    const [created] = await db.insert(employeeBankAccounts).values({
      workspaceId,
      employeeId,
      bankName: bankName || null,
      routingNumberEncrypted: encryptedRouting,
      accountNumberEncrypted: encryptedAccount,
      accountType: accountType || 'checking',
      routingNumberLast4: routingLast4,
      accountNumberLast4: accountLast4,
      depositType: depositType || 'full',
      depositAmount: depositAmount ? String(depositAmount) : null,
      depositPercent: depositPercent ? String(depositPercent) : null,
      isPrimary: isPrimary ?? true,
      isActive: true,
      addedBy: userId,
      notes: notes || null,
    }).returning();

    await db.update(employeeOnboardingProgress)
      .set({
        stepsCompleted: sql`CASE
          WHEN NOT (${employeeOnboardingProgress.stepsCompleted} @> '["direct_deposit"]'::jsonb)
          THEN ${employeeOnboardingProgress.stepsCompleted} || '["direct_deposit"]'::jsonb
          ELSE ${employeeOnboardingProgress.stepsCompleted}
        END`,
        directDepositComplete: true,
        status: sql`CASE
          WHEN ${employeeOnboardingProgress.overallProgressPct} >= 100 THEN 'complete'
          ELSE ${employeeOnboardingProgress.status}
        END`,
        lastUpdatedAt: new Date(),
      } as any)
      .where(
        and(
          eq(employeeOnboardingProgress.workspaceId, workspaceId),
          eq(employeeOnboardingProgress.employeeId, employeeId),
        )
      );

    const [progress] = await db.select()
      .from(employeeOnboardingProgress)
      .where(
        and(
          eq(employeeOnboardingProgress.workspaceId, workspaceId),
          eq(employeeOnboardingProgress.employeeId, employeeId),
        )
      )
      .limit(1);

    if (progress && ((progress.overallProgressPct || 0) >= 100 || progress.status === 'complete')) {
      const [employee] = await db.select({
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
        .limit(1);

      platformEventBus.emit('employee_onboarding_completed', {
        workspaceId,
        employeeId,
        employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Employee',
        completedAt: new Date().toISOString(),
      });
    }

    storage.createAuditLog({
      workspaceId, userId, userEmail: req.user?.email || 'unknown', userRole: req.user?.role || 'user',
      action: 'create', entityType: 'employee_bank_account', entityId: created.id,
      actionDescription: `Bank account (****${accountLast4}) added for employee ${employeeId}`,
      changes: { routing_last4: routingLast4, account_last4: accountLast4, accountType },
      isSensitiveData: true, complianceTag: 'soc2',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Mark direct deposit step complete in onboarding progress (non-blocking)
    ;(async () => {
      try {
        await db.execute(sql`
          UPDATE employee_onboarding_progress
          SET
            direct_deposit_complete = true,
            steps_completed = CASE
              WHEN NOT (steps_completed @> '["direct_deposit"]'::jsonb)
              THEN steps_completed || '["direct_deposit"]'::jsonb
              ELSE steps_completed
            END,
            last_updated_at = now()
          WHERE workspace_id = ${workspaceId} AND employee_id = ${employeeId}
        `);

        // Check if all steps are now complete → emit onboarding_completed event
        const progResult = await db.execute(sql`
          SELECT
            jsonb_array_length(steps_completed) as done,
            (SELECT COUNT(*) FROM employee_onboarding_steps WHERE required = true) as total,
            e.first_name, e.last_name
          FROM employee_onboarding_progress p
          JOIN employees e ON e.id = p.employee_id
          WHERE p.workspace_id = ${workspaceId} AND p.employee_id = ${employeeId}
          LIMIT 1
        `);

        const prog = (progResult as any).rows?.[0];
        if (prog) {
          const done = parseInt(prog.done) || 0;
          const total = parseInt(prog.total) || 1;
          const pct = Math.round((done / total) * 100);
          if (pct >= 100) {
            platformEventBus.publish({
              type: 'employee_onboarding_completed',
              workspaceId,
              title: `${prog.first_name} ${prog.last_name} completed onboarding`,
              payload: { employeeId, completedAt: new Date().toISOString() },
            });
          }
        }
      } catch (err: any) {
        log.warn('[BankAccounts] Onboarding progress update failed (non-blocking):', err?.message);
      }
    })();

    res.status(201).json({ success: true, bankAccount: maskBankAccount(created) });
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
    const { employeeId, accountId } = req.params;

    const [current] = await db.select().from(employeeBankAccounts)
      .where(and(eq(employeeBankAccounts.id, accountId), eq(employeeBankAccounts.workspaceId, workspaceId), eq(employeeBankAccounts.employeeId, employeeId)))
      .limit(1);
    if (!current) return res.status(404).json({ error: 'Bank account not found' });

    const parsed = employeeBankAccountUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid bank account update data', details: parsed.error.flatten() });
    const { bankName, routingNumber, accountNumber, accountType, depositType, depositAmount, depositPercent, isPrimary, notes } = parsed.data;
    const updateFields: Record<string, any> = { updatedAt: new Date() };

    if (bankName !== undefined) updateFields.bankName = bankName;
    if (accountType !== undefined) updateFields.accountType = accountType;
    if (depositType !== undefined) updateFields.depositType = depositType;
    if (depositAmount !== undefined) updateFields.depositAmount = String(depositAmount);
    if (depositPercent !== undefined) updateFields.depositPercent = String(depositPercent);
    if (notes !== undefined) updateFields.notes = notes;
    if (isPrimary !== undefined) updateFields.isPrimary = isPrimary;

    if (routingNumber) {
      updateFields.routingNumberEncrypted = encryptToken(String(routingNumber).trim());
      updateFields.routingNumberLast4 = String(routingNumber).trim().slice(-4);
    }
    if (accountNumber) {
      updateFields.accountNumberEncrypted = encryptToken(String(accountNumber).trim());
      updateFields.accountNumberLast4 = String(accountNumber).trim().slice(-4);
    }

    let updated: typeof employeeBankAccounts.$inferSelect | undefined;
    await db.transaction(async (tx) => {
      if (isPrimary) {
        // Atomically clear existing primary before setting new
        await tx.update(employeeBankAccounts).set({ isPrimary: false })
          .where(and(eq(employeeBankAccounts.workspaceId, workspaceId), eq(employeeBankAccounts.employeeId, employeeId)));
      }
      [updated] = await tx.update(employeeBankAccounts).set(updateFields)
        .where(and(
          eq(employeeBankAccounts.id, accountId),
          eq(employeeBankAccounts.workspaceId, workspaceId),
          eq(employeeBankAccounts.employeeId, employeeId)
        )).returning();
    });

    if (!updated) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    storage.createAuditLog({
      workspaceId, userId, userEmail: req.user?.email || 'unknown', userRole: req.user?.role || 'user',
      action: 'update', entityType: 'employee_bank_account', entityId: accountId,
      actionDescription: `Bank account (****${updated.accountNumberLast4}) updated for employee ${employeeId}`,
      changes: { updatedFields: Object.keys(updateFields) },
      isSensitiveData: true, complianceTag: 'soc2',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Non-blocking: security alert to org owner + managers when bank info changes
    const changedSensitive = routingNumber || accountNumber;
    if (changedSensitive) {
      (async () => {
        try {
          const { universalNotificationEngine } = await import('../services/universalNotificationEngine');
          await universalNotificationEngine.sendNotification({
            workspaceId,
            type: 'security_alert',
            title: 'Employee Bank Account Updated',
            message: `Direct deposit bank account (****${updated.accountNumberLast4}) was updated for employee ${employeeId}. Changed by: ${req.user?.email || userId}. Please verify this change is authorized.`,
            priority: 'high',
            severity: 'warning',
            targetRoles: ['org_owner', 'co_owner', 'payroll_admin'],
          });
        } catch (alertErr: unknown) {
          log.warn('[PayrollRoutes] Bank account change security alert failed (non-blocking):', (alertErr instanceof Error ? alertErr.message : String(alertErr)));
        }
      })();
    }

    res.json({ success: true, bankAccount: maskBankAccount(updated) });
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
    const { employeeId, accountId } = req.params;

    const [deactivated] = await db.update(employeeBankAccounts)
      .set({ isActive: false, deactivatedAt: new Date(), deactivatedBy: userId })
      .where(and(eq(employeeBankAccounts.id, accountId), eq(employeeBankAccounts.workspaceId, workspaceId), eq(employeeBankAccounts.employeeId, employeeId)))
      .returning();

    if (!deactivated) return res.status(404).json({ error: 'Bank account not found' });

    storage.createAuditLog({
      workspaceId, userId, userEmail: req.user?.email || 'unknown', userRole: req.user?.role || 'user',
      action: 'delete', entityType: 'employee_bank_account', entityId: accountId,
      actionDescription: `Bank account (****${deactivated.accountNumberLast4}) deactivated for employee ${employeeId}`,
      changes: { before: { isActive: true }, after: { isActive: false } },
      isSensitiveData: true, complianceTag: 'soc2',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true, message: 'Bank account deactivated' });
  } catch (error: unknown) {
    log.error('[BankAccounts] DELETE error:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

export default router;
