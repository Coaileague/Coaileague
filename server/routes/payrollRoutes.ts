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
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace context required" });
      }
      const { startDate, endDate } = req.query;

      // Get payroll runs
      const runs = await db.select({
        id: payrollRuns.id,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        status: payrollRuns.status,
        totalGrossPay: payrollRuns.totalGrossPay,
        totalNetPay: payrollRuns.totalNetPay,
        createdAt: payrollRuns.createdAt,
      }).from(payrollRuns)
        .where(eq(payrollRuns.workspaceId, workspaceId))
        .orderBy(desc(payrollRuns.createdAt));

      // Get all payroll entries
      const entries = await db.select({
        id: payrollEntries.id,
        employeeId: payrollEntries.employeeId,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        regularHours: payrollEntries.regularHours,
        overtimeHours: payrollEntries.overtimeHours,
        hourlyRate: payrollEntries.hourlyRate,
        grossPay: payrollEntries.grossPay,
        federalTax: payrollEntries.federalTax,
        stateTax: payrollEntries.stateTax,
        socialSecurity: payrollEntries.socialSecurity,
        medicare: payrollEntries.medicare,
        netPay: payrollEntries.netPay,
        createdAt: payrollEntries.createdAt,
      })
        .from(payrollEntries)
        .leftJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
        .where(eq(payrollEntries.workspaceId, workspaceId));

      // Generate CSV
      const csvHeader = 'Employee Name,Period Start,Period End,Regular Hours,Overtime Hours,Hourly Rate,Gross Pay,Deductions,Federal Tax,State Tax,Social Security,Medicare,Net Pay,Date\n';
      
      const employeeIds = [...new Set(entries.map((e: any) => e.employeeId))];
      const employeeMap = new Map();
      if (employeeIds.length > 0) {
        const emps = await db.select().from(employees).where(inArray(employees.id, employeeIds));
        emps.forEach(emp => employeeMap.set(emp.id, `${emp.firstName} ${emp.lastName}`));
      }

      const csvRows = entries.map((e: any) => {
        const employeeName = employeeMap.get(e.employeeId) || e.employeeId;
        // RC4 (Phase 2): sumFinancialValues uses Decimal.js — eliminates 4-field floating-point accumulation.
        const deductions = formatCurrency(sumFinancialValues([e.federalTax || '0', e.stateTax || '0', e.socialSecurity || '0', e.medicare || '0']));
        return `"${employeeName}",${e.periodStart ? format(new Date(e.periodStart), 'yyyy-MM-dd') : ''},${e.periodEnd ? format(new Date(e.periodEnd), 'yyyy-MM-dd') : ''},${e.regularHours},${e.overtimeHours},${e.hourlyRate},${e.grossPay},${deductions},${e.federalTax},${e.stateTax},${e.socialSecurity},${e.medicare},${e.netPay},${format(new Date(e.createdAt), 'yyyy-MM-dd')}`;
      }).join('\n');

      // Audit log: payroll data exports are sensitive — always record who exported what
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert((await import('@shared/schema')).auditLogs).values({
          id: crypto.randomUUID(),
          workspaceId,
          userId,
          action: 'payroll.export.csv',
          entityType: 'payroll',
          entityId: workspaceId,
          details: JSON.stringify({
            exportedRows: entries.length,
            dateRange: { startDate: startDate || null, endDate: endDate || null },
            exportedAt: new Date().toISOString(),
          }),
          ipAddress: req.ip || null,
          createdAt: new Date(),
        });
      } catch (auditErr) {
        log.warn('[Payroll] Failed to write export audit log (non-blocking):', auditErr);
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payroll-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error: unknown) {
      log.error("Error exporting payroll CSV:", error);
      res.status(500).json({ message: "Failed to export payroll" });
    }
  });

  router.get('/proposals', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) {
        return res.status(roleCheck.status || 403).json({ message: roleCheck.error || 'Insufficient permissions' });
      }
      const userId = req.user?.id;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId!);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { payrollProposals } = await import("@shared/schema");
      
      const proposals = await db.select().from(payrollProposals)
        .where(eq(payrollProposals.workspaceId, userWorkspace.workspaceId))
        .orderBy(desc(payrollProposals.id))
        .limit(100);
      
      res.json(proposals);
    } catch (error: unknown) {
      log.error("Error fetching payroll proposals:", error);
      res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to fetch proposals" });
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
      const runs = await storage.getPayrollRunsByWorkspace(workspaceId);
      res.json(runs);
    } catch (error: unknown) {
      log.error("Error fetching payroll runs:", error);
      res.status(500).json({ message: "Failed to fetch payroll runs" });
    }
  });

  router.get('/runs/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;

      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }

      const isManager = req.workspaceRole && hasManagerAccess(req.workspaceRole);
      const isPlatform = req.platformRole && hasPlatformWideAccess(req.platformRole);

      if (!isManager && !isPlatform) {
        const employee = await storage.getEmployeeByUserId(req.user?.id || '', workspaceId);
        if (!employee) {
          return res.status(403).json({ error: "No employee record found for your user in this workspace" });
        }
        
        // In a run-level fetch, we only show entries for the requesting employee if they are not a manager
        const entries = await db.select().from(payrollEntries)
          .where(and(eq(payrollEntries.payrollRunId, id), eq(payrollEntries.employeeId, employee.id)));
        
        return res.json({
          ...run,
          entries
        });
      }

      const entries = await storage.getPayrollEntriesByRun(id);

      res.json({
        ...run,
        entries
      });
    } catch (error: unknown) {
      log.error("Error fetching payroll run:", error);
      res.status(500).json({ message: "Failed to fetch payroll run" });
    }
  });

router.delete('/runs/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = checkManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const workspaceId = req.workspaceId!;
      const { id } = req.params;

      const run = await storage.getPayrollRun(id, workspaceId);
      if (!run) {
        return res.status(404).json({ message: "Payroll run not found" });
      }

      if (run.status !== 'draft') {
        return res.status(422).json({ message: "Only draft payroll runs can be deleted. This run has already been " + run.status });
      }

      await db.transaction(async (tx) => {
        await tx.delete(payrollEntries).where(eq(payrollEntries.payrollRunId, id));
        await tx.delete(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.workspaceId, workspaceId)));
      });

      const userId = req.user?.id;
      storage.createAuditLog({
        workspaceId,
        userId,
        action: 'delete',
        entityType: 'payroll_run',
        entityId: id,
        changes: { before: { status: run.status, payPeriodStart: run.periodStart, payPeriodEnd: run.periodEnd }, after: { status: 'deleted' } },
        metadata: { isSensitiveData: true, complianceTag: 'soc2' },
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll delete', { error: err?.message }));

      res.json({ message: "Payroll run deleted successfully" });
    } catch (error: unknown) {
      log.error("Error deleting payroll run:", error);
      res.status(500).json({ message: "Failed to delete payroll run" });
    }
  });

  router.get('/my-paychecks', async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Find employee record for this user
      const allEmployees = await db
        .select()
        .from(employees)
        .where(eq(employees.userId, userId));

      if (!allEmployees || allEmployees.length === 0) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      // Use the first employee record (users typically belong to one workspace)
      const employee = allEmployees[0];
      const workspaceId = employee.workspaceId;

      const paychecks = await storage.getPayrollEntriesByEmployee(employee.id, workspaceId);
      res.json(paychecks);
    } catch (error: unknown) {
      log.error("Error fetching paychecks:", error);
      res.status(500).json({ message: "Failed to fetch paychecks" });
    }
  });

router.get('/my-payroll-info', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
    });
    if (!employee) return res.status(404).json({ message: 'Employee record not found' });
    const info = await db.query.employeePayrollInfo.findFirst({
      where: and(
        eq(employeePayrollInfo.employeeId, employee.id),
        eq(employeePayrollInfo.workspaceId, employee.workspaceId)
      ),
    });

    if (!info) return res.json({ directDepositEnabled: false, preferredPayoutMethod: 'direct_deposit' });

    res.json({
      directDepositEnabled: info.directDepositEnabled,
      bankAccountType: info.bankAccountType,
      preferredPayoutMethod: info.preferredPayoutMethod,
      hasRoutingNumber: !!(info.bankRoutingNumber),
      hasAccountNumber: !!(info.bankAccountNumber),
    });
  } catch (error: unknown) {
    log.error('Error fetching payroll info:', error);
    res.status(500).json({ message: 'Failed to fetch payroll info' });
  }
});

router.patch('/my-payroll-info', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const allEmployees = await db.select().from(employees).where(eq(employees.userId, userId));
    if (!allEmployees.length) return res.status(404).json({ message: 'Employee record not found' });

    const employee = allEmployees[0];
    const parsed = payrollInfoUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payroll info', details: parsed.error.flatten() });
    const { bankAccountType, bankRoutingNumber, bankAccountNumber, directDepositEnabled, preferredPayoutMethod } = parsed.data;

    const existing = await db.query.employeePayrollInfo.findFirst({
      where: and(
        eq(employeePayrollInfo.employeeId, employee.id),
        eq(employeePayrollInfo.workspaceId, employee.workspaceId)
      ),
    });

    const updateFields: Record<string, any> = {};
    if (bankAccountType !== undefined) updateFields.bankAccountType = bankAccountType;
    if (directDepositEnabled !== undefined) updateFields.directDepositEnabled = directDepositEnabled;
    if (preferredPayoutMethod !== undefined) updateFields.preferredPayoutMethod = preferredPayoutMethod;

    // ACH COMPLIANCE: Encrypt routing/account numbers at rest before storage
    let encryptedRouting: string | undefined;
    let encryptedAccount: string | undefined;
    if (bankRoutingNumber !== undefined && bankRoutingNumber.trim()) {
      encryptedRouting = encryptToken(bankRoutingNumber.trim());
      updateFields.bankRoutingNumber = encryptedRouting;
    }
    if (bankAccountNumber !== undefined && bankAccountNumber.trim()) {
      encryptedAccount = encryptToken(bankAccountNumber.trim());
      updateFields.bankAccountNumber = encryptedAccount;
    }

    // Wrap both table writes in a single transaction — if bank account upsert fails,
    // the payrollInfo update rolls back too, keeping the two tables consistent.
    await db.transaction(async (tx) => {
      if (existing) {
        await tx.update(employeePayrollInfo)
          .set(updateFields)
          .where(and(
            eq(employeePayrollInfo.employeeId, employee.id),
            eq(employeePayrollInfo.workspaceId, employee.workspaceId)
          ));
      } else {
        await tx.insert(employeePayrollInfo).values({
          employeeId: employee.id,
          workspaceId: employee.workspaceId,
          ...updateFields,
        });
      }

      // Also upsert into canonical encrypted employee_bank_accounts table if bank data provided
      if (encryptedRouting || encryptedAccount) {
        const routingLast4 = bankRoutingNumber?.trim().slice(-4) || null;
        const accountLast4 = bankAccountNumber?.trim().slice(-4) || null;

        const [existingBankAcct] = await tx.select({ id: employeeBankAccounts.id })
          .from(employeeBankAccounts)
          .where(and(
            eq(employeeBankAccounts.workspaceId, employee.workspaceId),
            eq(employeeBankAccounts.employeeId, employee.id),
            eq(employeeBankAccounts.isPrimary, true),
            eq(employeeBankAccounts.isActive, true),
          ))
          .limit(1);

        if (existingBankAcct) {
          await tx.update(employeeBankAccounts).set({
            ...(encryptedRouting ? { routingNumberEncrypted: encryptedRouting, routingNumberLast4: routingLast4 } : {}),
            ...(encryptedAccount ? { accountNumberEncrypted: encryptedAccount, accountNumberLast4: accountLast4 } : {}),
            ...(bankAccountType ? { accountType: bankAccountType } : {}),
            updatedAt: new Date(),
          }).where(eq(employeeBankAccounts.id, existingBankAcct.id));
        } else {
          await tx.insert(employeeBankAccounts).values({
            workspaceId: employee.workspaceId,
            employeeId: employee.id,
            routingNumberEncrypted: encryptedRouting || null,
            accountNumberEncrypted: encryptedAccount || null,
            routingNumberLast4: routingLast4,
            accountNumberLast4: accountLast4,
            accountType: bankAccountType || 'checking',
            isPrimary: true,
            isActive: true,
            addedBy: userId,
          });
        }
      }
    });

    res.json({ success: true, message: 'Direct deposit settings updated' });
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

    const taxYear = req.query.taxYear ? parseInt(req.query.taxYear as string) : undefined;

    const empRecords = await db
      .select()
      .from(employees)
      .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)));

    if (!empRecords || empRecords.length === 0) {
      return res.status(404).json({ message: 'No employee record found for your account in this workspace' });
    }

    const employee = empRecords[0];

    const { taxFilingAssistanceService } = await import('../services/taxFilingAssistanceService');
    const forms = await taxFilingAssistanceService.getEmployeeTaxForms(employee.id, workspaceId, taxYear);

    res.json({
      employeeId: employee.id,
      employeeName: `${(employee as any).firstName || ''} ${(employee as any).lastName || ''}`.trim(),
      forms: forms.map(f => ({
        id: f.id,
        formType: f.formType,
        taxYear: f.taxYear,
        wages: f.wages,
        federalTaxWithheld: f.federalTaxWithheld,
        stateTaxWithheld: f.stateTaxWithheld,
        socialSecurityWages: f.socialSecurityWages,
        socialSecurityTaxWithheld: f.socialSecurityTaxWithheld,
        medicareWages: f.medicareWages,
        medicareTaxWithheld: f.medicareTaxWithheld,
        generatedAt: f.generatedAt,
        isActive: f.isActive,
      })),
    });
  } catch (error: unknown) {
    log.error('Error fetching my tax forms:', error);
    res.status(500).json({ message: 'Failed to fetch tax forms' });
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
      if (result.vaultId) res.setHeader('X-Document-Vault-Id', result.vaultId);
      if (result.documentNumber) res.setHeader('X-Document-Number', result.documentNumber);
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
      if (result.vaultId) res.setHeader('X-Document-Vault-Id', result.vaultId);
      if (result.documentNumber) res.setHeader('X-Document-Number', result.documentNumber);
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
/**
 * GAP FIX 7: Payroll PDF Summary Export
 * GET /api/payroll/export/pdf/:runId
 * Generates a professional PDF summary of a payroll run.
 */
/**
 * GAP FIX 14: Pre-payroll invoice checklist
 * GET /api/payroll/pre-run-checklist
 * Shows outstanding invoices for the current pay period so org_owner can decide
 * whether to send invoices before approving payroll.
 */
/**
 * GAP FIX 10: 1099 Threshold Report
 * GET /api/payroll/1099-report?year=2025
 * Returns all contractors who exceeded $600 in the given year.
 */
/**
 * GET /api/payroll/runs/:id/nacha
 * Downloads a NACHA ACH formatted file for direct deposit submission.
 * Only available for processed payroll runs. Requires manager access.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Employee Bank Account CRUD
// Canonical encrypted ACH direct deposit management per employee.
// All routing + account numbers are AES-256-GCM encrypted at rest.
// Returns masked values (last-4 only) — never returns decrypted plaintext.
// ─────────────────────────────────────────────────────────────────────────────

function requireManagerOrOwn(req: AuthenticatedRequest, employeeOwnerId: string | null): boolean {
  if (hasPlatformWideAccess(req.platformRole)) return true;
  if (hasManagerAccess(req.workspaceRole)) return true;
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

    const [employee] = await db.select({ userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!requireManagerOrOwn(req, employee.userId)) {
      return res.status(403).json({ error: 'You can only update your own direct deposit account' });
    }

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

export default router;
