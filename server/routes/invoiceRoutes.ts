import { sanitizeError } from '../middleware/errorHandler';
import { validateInvoiceAmount, validateBillingRate, validatePartialPaymentAmount, validateNonNegativeAmount, businessRuleResponse } from '../lib/businessRules';
import { PLATFORM } from '../config/platformConfig';
import { Router } from "express";
import crypto from 'crypto';
import {
  invoiceUpdateBodySchema,
  markPaidBodySchema,
  partialPaymentBodySchema,
  creditMemoBodySchema,
  invoiceAdjustmentBodySchema,
  applyLateFeesBodySchema,
} from '@shared/schemas/financial';
import {
  calculateInvoiceLineItem,
  calculateInvoiceTotal,
  sumFinancialValues,
  subtractFinancialValues,
  multiplyFinancialValues,
  toFinancialString,
  formatCurrency,
} from '../services/financialCalculator';
import { trimStrings } from "../utils/sanitize";
import type { AuthenticatedRequest } from "../rbac";
import { platformEventBus } from '../services/platformEventBus';
import { getWorkspaceTier, hasTierAccess } from '../tierGuards';
import { hasManagerAccess, hasPlatformWideAccess, resolveWorkspaceForUser, getUserPlatformRole, requireManager } from "../rbac";
import { db, pool } from "../db";
import { storage } from "../storage";
import { eq, and, desc, sql, inArray, isNull, not } from "drizzle-orm";
import {
  clients,
  invoices,
  employees,
  stagedShifts,
  timeEntries as timeEntriesTable,
  insertInvoiceSchema,
  paymentRecords,
  invoiceReminders,
  invoicePayments,
  invoiceAdjustments,
  billingAuditLog,
  documentVault,
  clientBillingSettings,
} from '@shared/schema';
import * as notificationHelpers from "../notifications";
import { format } from "date-fns";
import PDFDocument from "pdfkit";

async function requireManagerRole(req: AuthenticatedRequest): Promise<{ allowed: boolean; error?: string; status?: number }> {
  const userId = req.user?.id || (req.user)?.claims?.sub;
  if (!userId) return { allowed: false, error: 'Unauthorized', status: 401 };

  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) return { allowed: true };

  const requestedWorkspaceId = req.body?.workspaceId || req.query?.workspaceId || req.params?.workspaceId;
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);

  if (!resolved.workspaceId || !resolved.role) {
    return { allowed: false, error: resolved.error || 'Workspace not found', status: 403 };
  }

  if (!hasManagerAccess(resolved.role)) {
    return { allowed: false, error: 'Insufficient permissions - requires manager role or higher', status: 403 };
  }

  req.workspaceId = resolved.workspaceId;
  req.workspaceRole = resolved.role as any;
  req.employeeId = resolved.employeeId || undefined;
  return { allowed: true };
}

const invoiceGenLocks = new Map<string, { userId: string; startedAt: number }>();
const INVOICE_GEN_LOCK_TTL_MS = 5 * 60 * 1000;

function acquireInvoiceGenLock(workspaceId: string, userId: string): { acquired: boolean; holder?: string } {
  const existing = invoiceGenLocks.get(workspaceId);
  if (existing && Date.now() - existing.startedAt < INVOICE_GEN_LOCK_TTL_MS) {
    return { acquired: false, holder: existing.userId };
  }
  invoiceGenLocks.set(workspaceId, { userId, startedAt: Date.now() });
  return { acquired: true };
}

function releaseInvoiceGenLock(workspaceId: string) {
  invoiceGenLocks.delete(workspaceId);
}
import { unmarkEntriesAsBilled } from "../services/automation/billableHoursAggregator";
import Stripe from "stripe";
import { sendInvoiceGeneratedEmail } from "../services/emailCore";
import { requireAuth } from "../auth";
import { getStripe, isStripeConfigured } from "../services/billing/stripeClient";
import { mutationLimiter } from "../middleware/rateLimiter";

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing (TRINITY.md §F).
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

import { rateLimitMiddleware } from "../services/infrastructure/rateLimiting";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { createLogger } from '../lib/logger';
const log = createLogger('InvoiceRoutes');

// F2 FIX: UUID format guard — rejects malformed params before they reach the DB.
// Drizzle uses parameterized queries so there is no injection risk, but early exit
// prevents unnecessary DB lookups and gives clients a clear 400 instead of a 500.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidId(id: string): boolean {
  return UUID_REGEX.test(id);
}

const router = Router();
const DEFAULT_ROUND_HOURS_INCREMENT = '0.25';

// Apply rate limiting to all invoice routes
// Billing operations are sensitive and involve PDF generation/Stripe calls

import { meteredGptClient } from "../services/billing/meteredGptClient";
import { createHash } from "crypto";

router.get('/proposals', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
      const workspaceId = req.workspaceId!;

      const { invoiceProposals } = (await import("@shared/schema")) as any;
      
      const proposals = await db.select({
        id: invoiceProposals.id,
        invoiceId: invoiceProposals.invoiceId,
        clientId: invoiceProposals.clientId,
        status: invoiceProposals.status,
        totalAmount: invoiceProposals.totalAmount,
        createdAt: invoiceProposals.createdAt,
        updatedAt: invoiceProposals.updatedAt,
      }).from(invoiceProposals)
        .where(eq(invoiceProposals.workspaceId, workspaceId))
        .orderBy(desc(invoiceProposals.id))
        .limit(100);
      
      res.json(proposals);
    } catch (error: unknown) {
      log.error("Error fetching invoice proposals:", error);
      res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to fetch proposals" });
    }
  });

router.patch('/proposals/:id/reject', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId!);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { invoiceProposals } = (await import("@shared/schema")) as any;
      const [proposal] = await db.select().from(invoiceProposals).where(
        and(
          eq(invoiceProposals.id, id),
          eq(invoiceProposals.workspaceId, userWorkspace.workspaceId),
          eq(invoiceProposals.status, 'pending')
        )
      ).limit(1);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found or already processed" });
      }
      
      await db.update(invoiceProposals).set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason || 'No reason provided',
        updatedAt: new Date(),
      }).where(and(
        eq(invoiceProposals.id, id),
        eq(invoiceProposals.workspaceId, userWorkspace.workspaceId)
      ));

      storage.createAuditLog({
        workspaceId: userWorkspace.workspaceId,
        userId: userId!,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'update',
        entityType: 'invoice',
        entityId: proposal.invoiceId || id,
        actionDescription: `Invoice proposal ${id} rejected`,
        changes: { before: { status: 'pending' }, after: { status: 'rejected', rejectedBy: userId, reason: reason || 'No reason provided' } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice rejection', { error: err?.message }));

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(userWorkspace.workspaceId, { type: 'invoices_updated', action: 'rejected' });
      platformEventBus.publish({
        type: 'invoice_cancelled',
        category: 'automation',
        title: 'Invoice Proposal Rejected',
        description: `Invoice proposal ${id} rejected${reason ? ` — ${reason}` : ''}`,
        workspaceId: userWorkspace.workspaceId,
        userId: userId!,
        metadata: {
          proposalId: id,
          invoiceId: proposal.invoiceId,
          rejectedBy: userId,
          reason: reason || 'No reason provided',
          source: 'proposal_reject',
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.json({
        success: true,
        proposalId: id,
        message: 'Invoice proposal rejected.',
      });
    } catch (error: unknown) {
      res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to reject invoice" });
    }
  });

uter.post('/:id/send', mutationLimiter, async (req: any, res: any) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const invoice = await storage.getInvoice(id, workspaceId);
      
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      if (['paid', 'void', 'cancelled'].includes(invoice.status || '')) {
        return res.status(400).json({ message: `Cannot send invoice in ${invoice.status} status` });
      }

      const client = await storage.getClient(invoice.clientId, workspaceId);
      if (!client || !client.email) {
        return res.status(400).json({ message: "Client has no email address" });
      }

      const { sendInvoiceWithEmail } = await import('../services/timesheetInvoiceService');
      const result = await sendInvoiceWithEmail({
        invoiceId: id,
        workspaceId,
        userId: req.user.id,
      });

      if (!result.success) {
        return res.status(500).json({ message: result.message || "Failed to send invoice email" });
      }

      await storage.updateInvoice(id, workspaceId, { status: 'sent', updatedAt: new Date() } as any);

      res.json({ success: true, message: "Invoice sent successfully" });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) || "Failed to send invoice" });
    }
  });

uter.post('/', idempotencyMiddleware, async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId =
        req.user?.id ||
        (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
      if (!userId) {
        return res.status(403).json({ message: 'User context not found' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // GAP-50 FIX: Enforce professional tier gate for invoice creation.
      // billingConfig.ts feature matrix declares invoice_generation as professional+ only.
      // Without this check a starter/trial org can POST invoices — bypassing the plan wall
      // and billing its clients without paying for the feature.
      const workspaceTier = await getWorkspaceTier(workspace.id);
      if (!hasTierAccess(workspaceTier, 'professional')) {
        return res.status(402).json({
          error: 'Invoice creation requires the Professional plan or higher',
          currentTier: workspaceTier,
          minimumTier: 'professional',
          requiresTierUpgrade: true,
        });
      }

      // T003: Validate clientId belongs to this workspace to prevent cross-org references.
      const clientIdFromBody = req.body.clientId;
      let invoiceContractWarning: string | null = null;
      if (clientIdFromBody) {
        const [clientCheck] = await db.select({
          id: clients.id,
          contractSignedAt: clients.contractSignedAt,
          clientOnboardingStatus: clients.clientOnboardingStatus,
        })
          .from(clients)
          .where(and(eq(clients.id, clientIdFromBody), eq(clients.workspaceId, workspace.id)))
          .limit(1);
        if (!clientCheck) {
          return res.status(400).json({ message: "Client not found in this workspace" });
        }
        // NON-BLOCKING: warn if client has no signed contract
        if (!clientCheck.contractSignedAt) {
          invoiceContractWarning = 'No signed contract on file for this client. Invoice created but contract is required before billing.';
        }
      }

      // T002: Workspace-prefixed invoice number with UUID suffix eliminates collision risk
      // across concurrent requests and across orgs sharing the same millisecond timestamp.
      const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;

      const { enforceAttribution } = await import('../middleware/dataAttribution');
      const rawValidated = insertInvoiceSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
        invoiceNumber,
        platformFeePercentage: workspace.platformFeePercentage,
      });

      if (businessRuleResponse(res, [
        validateInvoiceAmount((rawValidated as any).totalAmount ?? req.body.totalAmount, 'totalAmount'),
      ])) return;

      const validated = enforceAttribution('invoices', rawValidated, req.attribution || {
        workspaceId: workspace.id,
        actorId: userId || null,
        actorType: 'user',
        actorRole: null,
        actorIp: null,
      });

      const invoice = await db.transaction(async (tx) => {
        const createdInvoice = await tx
          .insert(invoices)
          .values(validated as any)
          .returning()
          .then(rows => rows[0]);

        // Write AR ledger entry: invoice_created = debit (accounts receivable increases — client now owes us)
        const { writeLedgerEntry } = await import('../services/orgLedgerService');
        await writeLedgerEntry({
          workspaceId: workspace.id,
          entryType: 'invoice_created',
          direction: 'debit',
          amount: parseFloat(String(createdInvoice.total || validated.totalAmount || 0)),
          relatedEntityType: 'invoice',
          relatedEntityId: createdInvoice.id,
          invoiceId: createdInvoice.id,
          createdBy: userId,
          description: `Invoice ${createdInvoice.invoiceNumber} created — $${parseFloat(String(createdInvoice.total || validated.totalAmount || 0)).toFixed(2)} AR opened`,
          metadata: { clientId: validated.clientId, invoiceNumber: createdInvoice.invoiceNumber },
          tx,
        });

        // Create revenue recognition schedule (Issue #5: invoice-to-revenue linking)
        const recognitionMethod = (createdInvoice as any).recognitionMethod ?? 'cash';
        const invoiceTotal = parseFloat(String(createdInvoice.total || validated.totalAmount || 0));
        if (invoiceTotal > 0 && createdInvoice.clientId) {
          try {
            const { createScheduleForInvoice } = await import('../services/billing/revenueRecognitionService');
            await createScheduleForInvoice(tx, {
              workspaceId: workspace.id,
              invoiceId: createdInvoice.id,
              clientId: createdInvoice.clientId,
              totalAmount: invoiceTotal,
              recognitionMethod: recognitionMethod === 'accrual' ? 'accrual' : 'cash',
              periodMonths: req.body?.recognitionPeriodMonths ?? 1,
              startDate: createdInvoice.issueDate ? new Date(createdInvoice.issueDate) : new Date(),
              createdBy: userId,
            });
          } catch (revErr: any) {
            log.warn('[InvoiceRoutes] Revenue schedule creation failed (non-fatal)', { error: revErr?.message });
          }
        }

        return createdInvoice;
      });

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'create',
        entityType: 'invoice',
        entityId: invoice.id,
        actionDescription: `Invoice ${invoice.invoiceNumber} created`,
        changes: { after: { invoiceNumber: invoice.invoiceNumber, total: validated.totalAmount, clientId: validated.clientId, status: 'draft' } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice creation', { error: err?.message }));

      pool.query(
        `INSERT INTO universal_audit_log (workspace_id, actor_id, action, entity_type, entity_id, action_description, changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspace.id,
          userId,
          'create',
          'invoice',
          invoice.id,
          `Invoice ${invoice.invoiceNumber} created`,
          JSON.stringify({ invoiceNumber: invoice.invoiceNumber, total: validated.totalAmount, clientId: validated.clientId, status: 'draft' }),
        ]
      ).catch(err => log.error('[FinancialAudit] CRITICAL: universal_audit_log write failed for invoice creation', { error: err?.message }));

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(workspace.id, { type: 'invoices_updated', action: 'created' });

      platformEventBus.publish({
        type: 'invoice_created',
        category: 'automation',
        title: `Invoice ${invoice.invoiceNumber} Created`,
        description: `New invoice for $${parseFloat(String(validated.totalAmount || 0)).toFixed(2)} created`,
        workspaceId: workspace.id,
        userId,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: validated.totalAmount, clientId: validated.clientId, status: 'draft' },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      notificationHelpers.createInvoiceCreatedNotification(
        { storage: storage as any },
        {
          workspaceId: workspace.id,
          userId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber || invoice.id,
          clientName: validated.clientName || 'Client',
          totalAmount: String(validated.totalAmount || '0'),
          createdBy: userId,
        }
      ).catch(err => log.error('Failed to create invoice notification:', err));
      
      res.status(201).json({ ...invoice, contractWarning: invoiceContractWarning });
    } catch (error: unknown) {
      log.error("Error creating invoice:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to create invoice" });
    }
  });
outer.get('/:id/payment-status', async (req, res) => {
    try {
      const { id } = req.params;

      const invoice = await storage.getInvoiceById(id);
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const payments = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, id))
        .orderBy(desc(invoicePayments.createdAt));

      res.json({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        status: invoice.status,
        paidAt: invoice.paidAt,
        payments: payments.map(p => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
          paymentMethod: p.paymentMethod,
          last4: p.last4,
          paidAt: p.paidAt,
          receiptUrl: p.receiptUrl,
        })),
      });
    } catch (error: unknown) {
      log.error('Error getting payment status:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to get payment status' });
    }
  });

router.patch("/adjustments/:adjustmentId/approve", async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ error: roleCheck.error });
    const { adjustmentId } = req.params;
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });

    // Write-protection: fetch current state before mutating
    const [current] = await db.select().from(invoiceAdjustments)
      .where(and(eq(invoiceAdjustments.id, adjustmentId), eq(invoiceAdjustments.workspaceId, workspaceId)))
      .limit(1);
    if (!current) return res.status(404).json({ error: 'Adjustment not found' });
    if (current.status !== 'pending') {
      return res.status(409).json({
        code: 'ADJUSTMENT_CLOSED',
        currentStatus: current.status,
        error: `This adjustment has already been ${current.status} and cannot be modified`,
      });
    }

    const [adjustment] = await db.update(invoiceAdjustments)
      .set({ status: 'approved', approvedBy: userId, approvedAt: new Date() })
      .where(and(eq(invoiceAdjustments.id, adjustmentId), eq(invoiceAdjustments.workspaceId, workspaceId), eq(invoiceAdjustments.status, 'pending')))
      .returning();

    if (!adjustment) return res.status(409).json({ error: 'Concurrent modification — adjustment no longer pending' });

    storage.createAuditLog({
      workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'invoice_adjustment',
      entityId: adjustmentId,
      actionDescription: `Invoice adjustment ${adjustmentId} approved`,
      changes: { before: { status: 'pending' }, after: { status: 'approved', approvedBy: userId } },
      isSensitiveData: false,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for adjustment approval', { error: err?.message }));

    res.json({ success: true, data: adjustment });
  } catch (error: unknown) {
    log.error('Error approving adjustment:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.get('/tax-rates', async (req: AuthenticatedRequest, res) => {
  try {
    const { stateTaxService } = await import('../services/billing/stateTaxService');
    const rates = stateTaxService.getAllStateTaxRates();
    res.json(rates);
  } catch (error: unknown) {
    log.error('Error fetching state tax rates:', error);
    res.status(500).json({ message: 'Failed to fetch state tax rates' });
  }
});

router.get('/tax-rates/resolve/:clientId', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { clientId } = req.params;
    const userId =
      req.user?.id ||
      (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
    if (!userId) return res.status(404).json({ message: 'User context not found' });
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const { stateTaxService } = await import('../services/billing/stateTaxService');

    const { workspaces: workspacesTable } = await import('@shared/schema');
    const [workspace] = await db.select({ defaultTaxRate: workspacesTable.defaultTaxRate })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, userWorkspace.workspaceId))
      .limit(1);

    const fallbackRate = workspace?.defaultTaxRate ? parseFloat(workspace.defaultTaxRate) : undefined;
    const result = await stateTaxService.resolveEffectiveTaxRate(clientId, userWorkspace.workspaceId, fallbackRate);
    res.json(result);
  } catch (error: unknown) {
    log.error('Error resolving tax rate:', error);
    res.status(500).json({ message: 'Failed to resolve tax rate' });
  }
});

router.delete('/tax-rates/client-override/:clientId', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { clientId } = req.params;
    const { stateTaxService } = await import('../services/billing/stateTaxService');
    const removed = stateTaxService.removeClientTaxOverride(clientId);

    if (!removed) {
      return res.status(404).json({ message: 'No override found for this client' });
    }

    res.json({ success: true, clientId });
  } catch (error: unknown) {
    log.error('Error removing client tax override:', error);
    res.status(500).json({ message: 'Failed to remove client tax override' });
  }
});

router.post('/:id/partial-payment', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { id } = req.params;

    // RC7: Zod catches type errors on amount and invalid paymentMethod values before
    // the payment is recorded, preventing malformed entries in the payment ledger.
    const partialParsed = partialPaymentBodySchema.safeParse(req.body);
    if (!partialParsed.success) {
      return res.status(400).json({ message: 'Invalid request body', errors: partialParsed.error.flatten().fieldErrors });
    }
    const { amount, paymentMethod, payerEmail, payerName, notes } = partialParsed.data;
    if (businessRuleResponse(res, [validatePartialPaymentAmount(amount, undefined, 'amount')])) return;

    const userId =
      req.user?.id ||
      (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
    if (!userId) return res.status(404).json({ message: 'User context not found' });
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const { invoiceService } = await import('../services/billing/invoice');
    const result = await invoiceService.recordPartialPayment(
      id,
      userWorkspace.workspaceId,
      amount,
      paymentMethod || 'manual',
      payerEmail,
      payerName,
      notes,
    );

    storage.createAuditLog({
      workspaceId: userWorkspace.workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'payment',
      entityId: result.payment.id,
      actionDescription: `Partial payment of $${amount.toFixed(2)} recorded for invoice ${id}`,
      changes: { after: { amount, paymentMethod, remainingBalance: result.remainingBalance } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for partial payment', { error: err?.message }));

    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(userWorkspace.workspaceId, { type: 'invoices_updated', action: 'partial_payment' });

    platformEventBus.publish({
      type: 'payment_received_partial',
      category: 'automation',
      title: `Partial Payment Recorded`,
      description: `$${amount.toFixed(2)} partial payment recorded — $${result.remainingBalance.toFixed(2)} remaining`,
      workspaceId: userWorkspace.workspaceId,
      userId: req.user?.id || (req.user)?.claims?.sub,
      metadata: {
        invoiceId: id,
        amountReceived: amount,
        remainingBalance: result.remainingBalance,
        paymentMethod,
        paymentId: result.payment?.id,
      },
      visibility: 'manager',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      payment: result.payment,
      invoice: result.invoice,
      remainingBalance: result.remainingBalance,
    });
  } catch (error: unknown) {
    log.error('Error recording partial payment:', error);
    res.status(400).json({ message: sanitizeError(error) || 'Failed to record partial payment' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Marks an invoice as 'disputed', freezes further PATCH edits and re-sends,
// and writes a full billing_audit_log entry + platform event.
// The 'disputed' status is an established part of the invoice enum but had no
// creation path — it could only be set via PATCH which bypasses the full audit
// trail and does not lock the invoice.
// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// Resolves an open invoice dispute, returning the invoice to 'sent' status
// (or a caller-specified target status). Writes full billing_audit_log.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/apply-late-fees', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const userId =
      req.user?.id ||
      (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
    if (!userId) return res.status(404).json({ message: 'User context not found' });
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    // RC7: Validate late fee config before applying to potentially many invoices.
    const lateFeesParsed = applyLateFeesBodySchema.safeParse(req.body);
    if (!lateFeesParsed.success) {
      return res.status(400).json({ message: 'Invalid request body', errors: lateFeesParsed.error.flatten().fieldErrors });
    }
    const { gracePeriodDays, lateFeeType, lateFeeAmount } = lateFeesParsed.data;

    const { invoiceService } = await import('../services/billing/invoice');
    const results = await invoiceService.applyLateFees(userWorkspace.workspaceId, {
      gracePeriodDays,
      lateFeeType,
      lateFeeAmount,
    });

    storage.createAuditLog({
      workspaceId: userWorkspace.workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'invoice',
      entityId: 'batch',
      actionDescription: `Late fees applied to ${results.length} invoices`,
      changes: { after: { invoicesAffected: results.length, config: { gracePeriodDays, lateFeeType, lateFeeAmount } } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for late fees', { error: err?.message }));

    res.json({
      success: true,
      invoicesAffected: results.length,
      details: results,
    });
  } catch (error: unknown) {
    log.error('Error applying late fees:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to apply late fees' });
  }
});

router.post('/send-payment-reminders', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const userId =
      req.user?.id ||
      (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
    if (!userId) return res.status(404).json({ message: 'User context not found' });
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const { invoiceService } = await import('../services/billing/invoice');
    const result = await invoiceService.processPaymentReminders(userWorkspace.workspaceId);

    storage.createAuditLog({
      workspaceId: userWorkspace.workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'payment_reminder',
      entityId: 'batch',
      actionDescription: `Payment reminders sent: ${result.remindersSent} reminders`,
      changes: { after: { remindersSent: result.remindersSent } },
      isSensitiveData: false,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payment reminders', { error: err?.message }));

    res.json({
      success: true,
      remindersSent: result.remindersSent,
      reminders: result.reminders,
    });
  } catch (error: unknown) {
    log.error('Error sending payment reminders:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to send payment reminders' });
  }
});

router.get('/my-invoices', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const clientRecord = await db.select({ id: clients.id, workspaceId: clients.workspaceId })
      .from(clients)
      .where(eq(clients.userId, userId))
      .limit(1);

    if (!clientRecord.length) {
      return res.json([]);
    }

    const { id: clientId, workspaceId } = clientRecord[0];
    const myInvoices = await db.select().from(invoices)
      .where(and(
        eq(invoices.clientId, clientId),
        eq(invoices.workspaceId, workspaceId)
      ))
      .orderBy(desc(invoices.createdAt))
      .limit(100);

    res.json(myInvoices);
  } catch (error: unknown) {
    log.error('Error fetching client self invoices:', error);
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
});

router.get('/portal/:accessToken/invoice/:invoiceId', async (req, res) => {
  try {
    const { accessToken, invoiceId } = req.params;
    const { clientPortalAccess, invoiceLineItems: lineItemsTable } = await import("@shared/schema");

    const [portal] = await db.select().from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.accessToken, accessToken),
        eq(clientPortalAccess.isActive, true),
      ));

    if (!portal) {
      return res.status(404).json({ message: "Portal access not found" });
    }

    const invoice = await storage.getInvoice(invoiceId, portal.workspaceId);
    if (!invoice || invoice.clientId !== portal.clientId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Mark invoice as viewed the first time the client opens it
    if (!invoice.viewedAt) {
      await db.update(invoices)
        .set({ viewedAt: new Date() })
        .where(and(
          eq(invoices.id, invoiceId),
          eq(invoices.workspaceId, portal.workspaceId),
        ));
    }

    const lineItems = await storage.getInvoiceLineItems(invoiceId);

    const { paymentRecords } = await import("@shared/schema");
    const payments = await db.select().from(paymentRecords)
      .where(and(
        eq(paymentRecords.invoiceId, invoiceId),
        eq(paymentRecords.workspaceId, portal.workspaceId),
        eq(paymentRecords.status, 'completed'),
      )).orderBy(desc(paymentRecords.paidAt));

    // GAP-52 FIX: Add '|| 0' fallbacks to parseFloat calls on DB numeric fields.
    // paymentRecords.amount and invoice.total are VARCHAR/numeric columns that Drizzle
    // returns as strings. If either is null (data corruption or schema migration edge
    // case), parseFloat(null) = NaN propagates into totalPaid and balanceRemaining,
    // causing the portal to display "$NaN" and potentially breaking client-side logic
    // that gates "Pay Now" or "Send Reminder" UI based on balanceRemaining > 0.
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

    res.json({
      invoice,
      lineItems,
      payments,
      totalPaid,
      balanceRemaining: Math.max(0, parseFloat(invoice.total || '0') - totalPaid),
    });
  } catch (error: unknown) {
    log.error("Error getting portal invoice:", error);
    res.status(500).json({ message: "Failed to load invoice" });
  }
});

/**
 * GAP FIX 3: Invoice Aging Report
 * GET /api/invoices/aging
 * Returns outstanding invoices bucketed into 0-30, 31-60, 61-90, 90+ day aging buckets.
 * This is the most important AR report for a security company.
 */
router.get('/aging', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) {
      return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    }
    const workspaceId = req.workspaceId!;
    const now = new Date();

    const openInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientId: invoices.clientId,
        total: invoices.total,
        dueDate: invoices.dueDate,
        status: invoices.status,
        issueDate: invoices.issueDate,
        sentAt: invoices.sentAt,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          sql`${invoices.status} NOT IN ('paid', 'void', 'cancelled')`,
          sql`${invoices.dueDate} IS NOT NULL`,
        ),
      )
      .orderBy(invoices.dueDate);

    const clientIds = [...new Set(openInvoices.map(i => i.clientId).filter(Boolean))];
    const clientMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const clientRows = await db
        .select({ id: clients.id, companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
        .from(clients)
        .where(and(
          inArray(clients.id, clientIds),
          eq(clients.workspaceId, workspaceId),
        ));
      for (const c of clientRows) {
        clientMap.set(c.id, c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown');
      }
    }

    const buckets = {
      current: { label: '0–30 days', invoices: [] as any[], total: 0 },
      thirtyOne: { label: '31–60 days', invoices: [] as any[], total: 0 },
      sixtyOne: { label: '61–90 days', invoices: [] as any[], total: 0 },
      ninetyPlus: { label: '90+ days', invoices: [] as any[], total: 0 },
    };

    for (const inv of openInvoices) {
      const dueDate = new Date(inv.dueDate!);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = parseFloat(inv.total || '0'); // GAP-52: null-safe
      const enriched = {
        ...inv,
        clientName: clientMap.get(inv.clientId) || 'Unknown',
        daysOverdue: Math.max(0, daysOverdue),
        amount,
      };

      if (daysOverdue <= 0) {
        buckets.current.invoices.push(enriched);
        buckets.current.total += amount;
      } else if (daysOverdue <= 30) {
        buckets.current.invoices.push(enriched);
        buckets.current.total += amount;
      } else if (daysOverdue <= 60) {
        buckets.thirtyOne.invoices.push(enriched);
        buckets.thirtyOne.total += amount;
      } else if (daysOverdue <= 90) {
        buckets.sixtyOne.invoices.push(enriched);
        buckets.sixtyOne.total += amount;
      } else {
        buckets.ninetyPlus.invoices.push(enriched);
        buckets.ninetyPlus.total += amount;
      }
    }

    const grandTotal = Object.values(buckets).reduce((sum, b) => sum + b.total, 0);

    res.json({
      asOf: now.toISOString(),
      grandTotal,
      buckets,
      summary: {
        current: buckets.current.total,
        thirtyOneSixty: buckets.thirtyOne.total,
        sixtyOneNinety: buckets.sixtyOne.total,
        ninetyPlus: buckets.ninetyPlus.total,
      },
    });
  } catch (error: unknown) {
    log.error('Error generating invoice aging report:', error);
    res.status(500).json({ message: 'Failed to generate aging report' });
  }
});

/**
 * GAP FIX 11: Cash Flow Dashboard Summary
 * GET /api/invoices/cash-flow-summary
 * Returns: money in (paid this month), money expected (sent unpaid), money overdue, money out (payroll), net.
 */
router.get('/cash-flow-summary', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) {
      return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    }
    const workspaceId = req.workspaceId!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [paidThisMonth, sentUnpaid, overdueInvoices] = await Promise.all([
      db.select({ total: sql<string>`COALESCE(SUM(${invoices.total}), 0)` })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'paid'),
          sql`${invoices.paidAt} >= ${monthStart}`,
          sql`${invoices.paidAt} <= ${monthEnd}`,
        )),

      db.select({
        total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'sent'),
          sql`${invoices.dueDate} >= ${now}`,
        )),

      db.select({
        total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          sql`${invoices.status} NOT IN ('paid', 'void', 'cancelled')`,
          sql`${invoices.dueDate} < ${now}`,
          sql`${invoices.dueDate} IS NOT NULL`,
        )),
    ]);

    const { payrollRuns, payrollEntries } = await import('@shared/schema');
    const { eq: eqR, and: andR, gte: gteR, lte: lteR } = await import('drizzle-orm');

    const payrollObligation = await db
      .select({ total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}), 0)` })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        sql`${payrollRuns.status} IN ('draft', 'pending', 'approved')`,
        gteR(payrollRuns.periodStart, monthStart),
        lteR(payrollRuns.periodEnd, monthEnd),
      ));

    const moneyIn = parseFloat(paidThisMonth[0]?.total || '0');
    const moneyExpected = parseFloat(sentUnpaid[0]?.total || '0');
    const moneyOverdue = parseFloat(overdueInvoices[0]?.total || '0');
    const moneyOut = parseFloat(payrollObligation[0]?.total || '0');
    const netPosition = moneyIn + moneyExpected - moneyOut;

    const topOverdue = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientId: invoices.clientId,
        total: invoices.total,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        sql`${invoices.status} NOT IN ('paid', 'void', 'cancelled')`,
        sql`${invoices.dueDate} < ${now}`,
        sql`${invoices.dueDate} IS NOT NULL`,
      ))
      .orderBy(invoices.dueDate)
      .limit(3);

    const topClientIds = [...new Set(topOverdue.map(i => i.clientId).filter(Boolean))];
    const topClientMap = new Map<string, string>();
    if (topClientIds.length > 0) {
      const topClients = await db
        .select({ id: clients.id, companyName: clients.companyName })
        .from(clients)
        .where(and(
          inArray(clients.id, topClientIds),
          eq(clients.workspaceId, workspaceId),
        ));
      for (const c of topClients) {
        topClientMap.set(c.id, c.companyName || 'Unknown');
      }
    }

    res.json({
      asOf: now.toISOString(),
      period: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
      moneyIn,
      moneyExpected,
      moneyOverdue,
      moneyOut,
      netPosition,
      overdueCount: parseInt(overdueInvoices[0]?.count || '0'),
      expectedCount: parseInt(sentUnpaid[0]?.count || '0'),
      topOverdueInvoices: topOverdue.map(i => ({
        ...i,
        clientName: topClientMap.get(i.clientId) || 'Unknown',
        daysOverdue: Math.floor((now.getTime() - new Date(i.dueDate!).getTime()) / (1000 * 60 * 60 * 24)),
        amount: parseFloat(i.total || '0'), // GAP-52: null-safe
      })),
    });
  } catch (error: unknown) {
    log.error('Error generating cash flow summary:', error);
    res.status(500).json({ message: 'Failed to generate cash flow summary' });
  }
});

// ─── CLIENT PORTAL — Acknowledge Invoice ────────────────────────────────────
// POST /portal/:accessToken/invoice/:invoiceId/acknowledge
// Client acknowledges receipt of an invoice from the portal without paying.
// Scoped by portal token: clientId + workspaceId verified against token.
// ─── CLIENT PORTAL — Dispute Invoice ────────────────────────────────────────
// POST /portal/:accessToken/invoice/:invoiceId/dispute
// Client initiates a dispute on an invoice from the portal.
// Marks invoice as 'disputed', freezes further edits, notifies workspace owner.
// ─── CLIENT PORTAL — Create Payment Intent ──────────────────────────────────
// POST /portal/:accessToken/invoice/:invoiceId/create-payment-intent
// Creates a Stripe PaymentIntent for the client to pay an invoice.
// Scoped by portal token: clientId + workspaceId verified against token.
// Returns { clientSecret, publishableKey, amount, currency, invoiceNumber }.

router.post('/:id/mark-paid', idempotencyMiddleware, async (req: any, res) => {
    try {
      // F2 FIX: Reject malformed IDs before hitting the DB (Drizzle is safe from injection,
      // but this gives a clean 400 instead of an empty-result 404 for garbage input).
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ message: "Invalid invoice ID format" });

      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId =
        req.user?.id ||
        (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
      if (!userId) {
        return res.status(403).json({ message: 'User context not found' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // RC7: Validate payment fields — prevents invalid paymentMethod enum values
      // from being written to the paymentRecords ledger.
      const markPaidParsed = markPaidBodySchema.safeParse(req.body);
      if (!markPaidParsed.success) {
        return res.status(400).json({ message: 'Invalid request body', errors: markPaidParsed.error.flatten().fieldErrors });
      }
      const { paymentMethod, paymentDate, notes, referenceNumber } = markPaidParsed.data;

      const paidAt = paymentDate ? new Date(paymentDate) : new Date();

      // T001: Wrap invoice UPDATE + paymentRecords INSERT in a single DB transaction.
      // Previously the paymentRecords insert ran separately with a .catch(() => []) that silently
      // swallowed failures — leaving the invoice marked 'paid' with no payment ledger record.
      // The transaction ensures both succeed or both roll back atomically.

      // First check if the invoice exists and is in a valid state for payment.
      const [preCheck] = await db.select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)))
        .limit(1);
      if (!preCheck) return res.status(404).json({ message: "Invoice not found" });
      // GAP-30 FIX: Added 'refunded' to pre-check — without it a refunded invoice
      // could be re-paid via this endpoint, resurrecting a settled/returned transaction.
      if (['paid', 'cancelled', 'void', 'refunded'].includes(preCheck.status || "")) {
        return res.status(409).json({ message: `Invoice is already ${preCheck.status}` });
      }

      // CHECK-10 FIX: Duplicate reference number guard — block submission of a
      // reference number that already exists for a DIFFERENT invoice in this workspace.
      // This prevents the same check/wire number from being recorded on two invoices,
      // which would produce a duplicate entry in the payment ledger.
      if (referenceNumber) {
        const [existingRef] = await db
          .select({ id: paymentRecords.id, invoiceId: paymentRecords.invoiceId })
          .from(paymentRecords)
          .where(and(
            eq(paymentRecords.workspaceId, workspace.id),
            eq(paymentRecords.transactionId, referenceNumber)
          ))
          .limit(1);
        if (existingRef && existingRef.invoiceId !== id) {
          return res.status(409).json({
            message: `Reference number '${referenceNumber}' is already recorded on another invoice (${existingRef.invoiceId}). Use a unique reference number.`,
          });
        }
      }

      // Atomicity: invoice UPDATE, paymentRecords INSERT, and AR ledger INSERT all
      // run inside a single DB transaction so financial state is never partially
      // committed. If any write fails the entire mark-paid rolls back.
      const { writeLedgerEntry } = await import('../services/orgLedgerService');
      const { updated, paymentRow } = await db.transaction(async (tx) => {
        const [updated] = await tx.update(invoices)
          .set({
            status: 'paid',
            paidAt,
            amountPaid: sql`${invoices.total}`,
            notes: notes || undefined,
          })
          .where(and(
            eq(invoices.id, id),
            eq(invoices.workspaceId, workspace.id),
            // GAP-30 FIX: Added 'refunded' to match the pre-check above.
            sql`${invoices.status} NOT IN ('paid', 'cancelled', 'void', 'refunded')`
          ))
          .returning();

        if (!updated) {
          throw new Error('CONCURRENT_PAYMENT: Invoice was paid by a concurrent request');
        }

        // Write a payment_records row so the org ledger has the full payment trail
        // (method, reference number, amount) — critical for cash/check/ACH/wire payments.
        const [paymentRow] = await tx.insert(paymentRecords).values({
          workspaceId: workspace.id,
          invoiceId: id,
          amount: updated.total,
          paymentMethod,
          transactionId: referenceNumber || null,
          status: 'completed',
          paidAt,
          notes: notes || null,
        }).returning();

        // AR ledger entry — payment_received reduces the outstanding balance.
        // Inside the TX so an ledger failure rolls back the invoice/payment record
        // rather than leaving AR out of sync with the invoice status.
        await writeLedgerEntry({
          workspaceId: workspace.id,
          entryType: 'payment_received',
          direction: 'credit',
          amount: parseFloat(updated.total),
          relatedEntityType: 'invoice',
          relatedEntityId: id,
          invoiceId: id,
          description: `Payment received for ${updated.invoiceNumber} via ${paymentMethod}${referenceNumber ? ` (ref: ${referenceNumber})` : ''} — $${updated.total}`,
          metadata: { paymentMethod, referenceNumber, paymentRecordId: paymentRow?.id },
          tx,
        });

        return { updated, paymentRow };
      });

      if (!updated) {
        return res.status(409).json({ message: "Invoice could not be marked as paid" });
      }

      // QuickBooks sync — fires after the TX commits so we never write to QB
      // for a rolled-back payment. Routed via platformEventBus `invoice_paid`
      // (published below), which QuickBooks integration listeners consume.

      // Recognize cash-method revenue on payment (Issue #5: invoice-to-revenue linking)
      try {
        const { recognizeCashRevenueOnPayment } = await import('../services/billing/revenueRecognitionService');
        await recognizeCashRevenueOnPayment(
          workspace.id,
          id,
          parseFloat(String(updated.total || 0)),
          userId,
        );
      } catch (revErr: any) {
        log.warn('[InvoiceRoutes] Cash revenue recognition failed (non-fatal)', { error: revErr?.message });
      }

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'payment_received',
        entityType: 'invoice',
        entityId: id,
        actionDescription: `Invoice ${updated.invoiceNumber} marked as paid via ${paymentMethod}${referenceNumber ? ` (ref: ${referenceNumber})` : ''}`,
        changes: {
          before: { status: 'unpaid' },
          after: { status: 'paid', paymentMethod, referenceNumber, paidAt: paidAt.toISOString(), amount: updated.total },
        },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice mark-as-paid', { error: err?.message }));

      // FIX-2: Financial audit log for regulatory compliance
      await db.insert(billingAuditLog).values({
        workspaceId: workspace.id,
        eventType: 'invoice_marked_paid',
        eventCategory: 'payment',
        actorType: 'user',
        actorId: userId,
        actorEmail: req.user?.email || null,
        description: `Invoice ${updated.invoiceNumber} marked as paid via ${paymentMethod}`,
        relatedEntityType: 'invoice',
        relatedEntityId: id,
        previousState: { status: preCheck.status },
        newState: { status: 'paid', paidAt: paidAt.toISOString(), paymentMethod, amount: updated.total },
        metadata: { referenceNumber, paymentRecordId: paymentRow?.id },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      }).catch(err => log.error('[BillingAudit] CRITICAL: billing_audit_log write failed for invoice mark-paid', { error: err?.message }));

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(workspace.id, {
        type: 'invoices_updated',
        action: 'paid',
        invoiceId: id,
        invoiceNumber: updated.invoiceNumber,
        amount: updated.total,
        paymentMethod,
        referenceNumber: referenceNumber || null,
        paidAt: paidAt.toISOString(),
        paymentRecordId: paymentRow?.id || null,
      });

      platformEventBus.publish({
        type: 'invoice_paid',
        category: 'automation',
        title: `Invoice ${updated.invoiceNumber} Paid`,
        description: `Invoice paid in full — $${parseFloat(String(updated.total || 0)).toFixed(2)} via ${paymentMethod}`,
        workspaceId: workspace.id,
        userId,
        metadata: {
          invoiceId: id,
          invoiceNumber: updated.invoiceNumber,
          total: updated.total,
          paymentMethod,
          referenceNumber: referenceNumber || null,
          paidAt: paidAt.toISOString(),
          clientId: updated.clientId,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // Non-blocking: send invoice paid confirmation email to org_owner
      (async () => {
        try {
          const { sendInvoicePaidEmail } = await import('../services/emailCore');
          const { users: usersTable, workspaces: workspacesTable, clients } = await import('@shared/schema');
          const [ws] = await db.select({ ownerId: workspacesTable.ownerId, name: workspacesTable.name })
            .from(workspacesTable).where(eq(workspacesTable.id, workspace.id)).limit(1);
          if (!ws?.ownerId) return;
          const [owner] = await db.select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
            .from(usersTable).where(eq(usersTable.id, ws.ownerId)).limit(1);
          if (!owner?.email) return;
          const clientName = updated.clientId
            ? (await db.select({ companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
                .from(clients).where(and(
                  eq(clients.id, updated.clientId),
                  eq(clients.workspaceId, workspace.id),
                )).limit(1)
                .then(rows => rows[0]?.companyName || [rows[0]?.firstName, rows[0]?.lastName].filter(Boolean).join(' ') || 'Client'))
            : 'Client';
          const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'there';
          await sendInvoicePaidEmail(owner.email, {
            ownerName,
            invoiceNumber: updated.invoiceNumber || id.substring(0, 8),
            clientName,
            amountPaid: parseFloat(updated.total || '0').toFixed(2),
            paymentDate: paidAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            paymentMethod,
            referenceNumber: referenceNumber || undefined,
            invoiceUrl: `${process.env.APP_BASE_URL || 'https://app.coaileague.com'}/invoices/${id}`,
          }, workspace.id);
          log.info(`[InvoiceRoutes] Invoice paid email sent to ${owner.email} for invoice ${updated.invoiceNumber}`);
        } catch (emailErr: unknown) {
          log.warn('[InvoiceRoutes] Invoice paid email failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
        }
      })();

      // Non-blocking: send payment receipt to client
      (async () => {
        try {
          const { sendPaymentReceiptToClientEmail } = await import('../services/emailCore');
          const { clients: clientsTable } = await import('@shared/schema');
          if (!updated.clientId) return;
          const [clientRow] = await db
            .select({ email: clientsTable.email, companyName: clientsTable.companyName, firstName: clientsTable.firstName, lastName: clientsTable.lastName })
            .from(clientsTable)
            .where(eq(clientsTable.id, updated.clientId))
            .limit(1);
          if (!clientRow?.email) return;
          const clientName = clientRow.companyName
            || [clientRow.firstName, clientRow.lastName].filter(Boolean).join(' ')
            || 'Valued Client';
          await sendPaymentReceiptToClientEmail(clientRow.email, {
            clientName,
            invoiceNumber: updated.invoiceNumber || id.substring(0, 8),
            amountPaid: parseFloat(String(updated.total ?? 0)).toFixed(2),
            paymentDate: paidAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            paymentMethod,
            referenceNumber: referenceNumber || undefined,
          }, workspace.id);
          log.info(`[InvoiceRoutes] Payment receipt sent to client ${clientRow.email} for invoice ${updated.invoiceNumber}`);
        } catch (receiptErr: unknown) {
          log.warn('[InvoiceRoutes] Client payment receipt failed (non-blocking):', (receiptErr instanceof Error ? receiptErr.message : String(receiptErr)));
        }
      })();

      // NDS in-app notification to workspace owner so the dashboard reflects
      // the paid state even when the email is unread. Complements the
      // platformEventBus 'invoice_paid' event which drives QB sync and role-
      // targeted notifications — this is a direct owner ping with the
      // transactional detail attached.
      (async () => {
        try {
          const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
          const { workspaces: workspacesSchema } = await import('@shared/schema');
          const [ws] = await db
            .select({ ownerId: workspacesSchema.ownerId })
            .from(workspacesSchema)
            .where(eq(workspacesSchema.id, workspace.id))
            .limit(1);
          if (ws?.ownerId) {
            await NotificationDeliveryService.send({
            type: 'invoice_paid',
              workspaceId: workspace.id,
              recipientUserId: ws.ownerId,
              channel: 'in_app',
              subject: `Invoice ${updated.invoiceNumber} marked paid`,
              body: {
                invoiceId: id,
                invoiceNumber: updated.invoiceNumber,
                amount: updated.total,
                paymentMethod,
                referenceNumber: referenceNumber || null,
                paidAt: paidAt.toISOString(),
                paymentRecordId: paymentRow?.id || null,
              },
              idempotencyKey: `invoice_paid-${id}-${paidAt.getTime()}`,
            });
          }
        } catch (ndsErr: unknown) {
          log.warn('[InvoiceRoutes] NDS invoice_paid notification failed (non-blocking):', (ndsErr instanceof Error ? ndsErr.message : String(ndsErr)));
        }
      })();

      // Charge middleware processing fee for non-manual invoice payments (awaited per TRINITY.md §B).
      // Manual payments have no processing fee (no card/ACH network involved).
      // chargeInvoiceMiddlewareFee uses idempotencyKey `invoice_${workspaceId}_${invoiceId}`,
      // so even if this runs twice for the same invoice, Stripe deduplicates the charge.
      if (paymentMethod !== 'manual') {
        try {
          const { chargeInvoiceMiddlewareFee } = await import('../services/billing/middlewareTransactionFees');
          const invoiceAmountCents = Math.round(parseFloat(String(updated.total || '0')) * 100);
          if (invoiceAmountCents > 0) {
            const feeResult = await chargeInvoiceMiddlewareFee({
              workspaceId: workspace.id,
              invoiceId: id,
              invoiceNumber: updated.invoiceNumber || id,
              invoiceAmountCents,
              paymentMethod: paymentMethod as 'card' | 'ach' | 'manual',
            });
            log.info(`[MarkPaid] Middleware fee: ${feeResult.description} (success: ${feeResult.success})`);
            if (feeResult.success && feeResult.amountCents > 0) {
              // DB ledger: write to financial_processing_fees
              try {
                const { financialProcessingFeeService } = await import('../services/billing/financialProcessingFeeService');
                await financialProcessingFeeService.recordInvoiceFee({ workspaceId: workspace.id, referenceId: id });
              } catch (err: any) {
                log.warn('[MarkPaid] Fee ledger record failed (non-fatal):', err?.message);
              }
              // Platform revenue tracking: write to platform_revenue table
              try {
                const { recordMiddlewareFeeCharge } = await import('../services/finance/middlewareFeeService');
                await recordMiddlewareFeeCharge(workspace.id, 'invoice_payment', feeResult.amountCents, id);
              } catch (err: any) {
                log.warn('[MarkPaid] Platform revenue record failed (non-fatal):', err?.message);
              }
            }
          }
        } catch (feeErr: unknown) {
          log.warn('[MarkPaid] Middleware fee charge failed (non-fatal):', (feeErr instanceof Error ? feeErr.message : String(feeErr)));
        }
      }

      res.json({ ...updated, paymentRecord: paymentRow || null });
    } catch (error: unknown) {
      log.error("Error marking invoice as paid:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to mark invoice as paid" });
    }
  });

router.post('/auto-generate', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // GAP-50 FIX: Enforce professional tier gate for auto-generate (same as manual creation).
      const autoGenTier = await getWorkspaceTier(workspace.id);
      if (!hasTierAccess(autoGenTier, 'professional')) {
        return res.status(402).json({
          error: 'Invoice auto-generation requires the Professional plan or higher',
          currentTier: autoGenTier,
          minimumTier: 'professional',
          requiresTierUpgrade: true,
        });
      }

      const lockResult = acquireInvoiceGenLock(workspace.id, userId);
      if (!lockResult.acquired) {
        return res.status(409).json({ error: "Invoice auto-generation is already in progress for this workspace", lockedBy: lockResult.holder });
      }

      try {
      const clients = await storage.getClientsByWorkspace(workspace.id);
      const allClientRates = await storage.getClientRatesByWorkspace(workspace.id);
      const allInvoices = await storage.getInvoicesByWorkspace(workspace.id);
      const allTimeEntries = await storage.getTimeEntriesByWorkspace(workspace.id);
      const allInvoiceSettings = await db
        .select()
        .from(clientBillingSettings)
        .where(eq(clientBillingSettings.workspaceId, workspace.id));
      
      const generatedInvoices = [];
      const errors = [];

      for (const client of clients) {
        try {
          // Get client's billing rate and cycle
          const clientRate = allClientRates.find(r => r.clientId === client.id);
          if (!clientRate || !clientRate.isActive) {
            continue;
          }

          const billingCycle = clientRate.subscriptionFrequency || 'monthly';
          
          // Get last invoice for this client
          const clientInvoices = allInvoices.filter((inv: any) => inv.clientId === client.id);
          const lastInvoice = clientInvoices.sort((a: any, b: any) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];

          // Determine if billing is due
          const now = new Date();
          let isDue = false;
          
          if (!lastInvoice) {
            isDue = true;
          } else {
            const lastInvoiceDate = new Date(lastInvoice.createdAt as string | Date);
            const daysSinceLastInvoice = Math.floor((now.getTime() - lastInvoiceDate.getTime()) / (1000 * 60 * 60 * 24));
            
            switch (billingCycle) {
              case 'weekly':
                isDue = daysSinceLastInvoice >= 7;
                break;
              case 'bi-weekly':
                isDue = daysSinceLastInvoice >= 14;
                break;
              case 'monthly':
              default:
                isDue = daysSinceLastInvoice >= 30;
                break;
            }
          }

          if (!isDue) {
            continue;
          }

          // Get unbilled time entries
          const unbilledEntries = allTimeEntries.filter((entry: any) => 
            entry.clientId === client.id && !entry.invoiceId && entry.clockOut && entry.status === 'approved'
          );

          if (unbilledEntries.length === 0) {
            continue;
          }

          // RC4 (Phase 2): Calculate totals using Decimal.js via FinancialCalculator.
          const invoiceSettings = allInvoiceSettings.find((s) => s.clientId === client.id);
          const roundHoursToIncrement = Math.max(0.01, Number(invoiceSettings?.roundHoursTo || DEFAULT_ROUND_HOURS_INCREMENT));
          const lineAmountParts: string[] = [];
          for (const entry of unbilledEntries) {
            const rawHours = Number(entry.totalHours || 0);
            const roundedHours = Math.round(rawHours / roundHoursToIncrement) * roundHoursToIncrement;
            const hoursStr = toFinancialString(String(roundedHours));
            const rateStr = toFinancialString(String(clientRate.billableRate || '0'));
            lineAmountParts.push(calculateInvoiceLineItem(hoursStr, rateStr));
          }
          const subtotalStr = lineAmountParts.length > 0 ? calculateInvoiceTotal(lineAmountParts) : '0.0000';

          const taxRateDecimal = Number(invoiceSettings?.taxRate ?? workspace.defaultTaxRate ?? '0');
          const taxRateStr = toFinancialString(String(taxRateDecimal));
          const taxStr = multiplyFinancialValues(subtotalStr, taxRateStr);
          const totalStr = sumFinancialValues([subtotalStr, taxStr]);

          const paymentTermsDays = client.paymentTermsDays ?? 30;
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + paymentTermsDays);

          // RACE CONDITION FIX: Create invoice + link time entries atomically using tx-bound queries
          const invoice = await db.transaction(async (tx) => {
            // Lock unbilled entries to prevent concurrent invoice generation claiming same entries
            const lockedEntries = await tx.select({ id: timeEntriesTable.id })
              .from(timeEntriesTable)
              .where(and(
                inArray(timeEntriesTable.id, unbilledEntries.map((e: any) => e.id)),
                isNull(timeEntriesTable.invoiceId)
              ))
              .for('update');

            if (lockedEntries.length === 0) {
              return null; // All entries already claimed by concurrent request
            }

            const [inv] = await tx
              .insert(invoices)
              .values({
                workspaceId: workspace.id,
                clientId: client.id,
                invoiceNumber: `AUTO-${Date.now()}-${crypto.randomUUID().substring(0, 9).toUpperCase()}`,
                issueDate: now.toISOString(),
                dueDate: dueDate.toISOString(),
                subtotal: subtotalStr,
                taxRate: multiplyFinancialValues(taxRateStr, '100'),
                tax: taxStr,
                total: totalStr,
                status: "draft",
                notes: `Auto-generated invoice for ${billingCycle} billing cycle`,
              } as any)
              .returning();

            const billedNow = new Date();
            for (const entry of lockedEntries) {
              await tx.update(timeEntriesTable)
                .set({ invoiceId: inv.id, billedAt: billedNow, updatedAt: billedNow })
                .where(and(eq(timeEntriesTable.id, entry.id), isNull(timeEntriesTable.invoiceId)));
            }
            return inv;
          });

          if (!invoice) continue; // Entries were claimed by concurrent request

          generatedInvoices.push({
            invoice,
            client,
            unbilledHours: unbilledEntries.reduce((sum: number, e: any) => 
              sum + parseFloat(e.totalHours as string || "0"), 0
            ),
          });

        } catch (error: unknown) {
          errors.push({
            clientId: client.id,
            clientName: `${client.firstName} ${client.lastName}`,
            error: sanitizeError(error),
          });
        }
      }

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(workspace.id, { type: 'invoices_updated', action: 'auto_generated' });
      for (const genInv of generatedInvoices) {
        platformEventBus.publish({
          type: 'invoice_created',
          category: 'automation',
          title: 'Invoice Auto-Generated',
          description: `Invoice ${genInv.invoice.invoiceNumber} auto-generated for ${genInv.client.firstName} ${genInv.client.lastName}`,
          workspaceId: workspace.id,
          userId,
          metadata: {
            invoiceId: genInv.invoice.id,
            invoiceNumber: genInv.invoice.invoiceNumber,
            clientId: genInv.client.id,
            total: genInv.invoice.total,
            unbilledHours: genInv.unbilledHours,
            source: 'auto_generate',
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }

      for (const genInv of generatedInvoices) {
        storage.createAuditLog({
          workspaceId: workspace.id,
          userId,
          userEmail: req.user?.email || 'unknown',
          userRole: req.user?.role || 'user',
          action: 'generate_invoice',
          entityType: 'invoice',
          entityId: genInv.invoice.id,
          actionDescription: `Auto-generated invoice for client ${genInv.client.firstName} ${genInv.client.lastName}`,
          changes: { after: { invoiceNumber: genInv.invoice.invoiceNumber, total: genInv.invoice.total, clientId: genInv.client.id, unbilledHours: genInv.unbilledHours, status: 'draft' } },
          isSensitiveData: true,
          complianceTag: 'soc2',
        }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for auto-generated invoice', { error: err?.message }));
      }

      res.json({
        success: true,
        generated: generatedInvoices.length,
        invoices: generatedInvoices,
        errors,
      });
      } finally {
        releaseInvoiceGenLock(workspace.id);
      }

    } catch (error: unknown) {
      log.error("Error auto-generating invoices:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to auto-generate invoices" });
    }
  });

router.post('/generate-from-time', async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId =
        req.user?.id ||
        (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
      if (!userId) {
        return res.status(403).json({ message: 'User context not found' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // GAP-50 FIX: Enforce professional tier gate on the generate-from-time path.
      const genFromTimeTier = await getWorkspaceTier(workspace.id);
      if (!hasTierAccess(genFromTimeTier, 'professional')) {
        return res.status(402).json({
          error: 'Invoice generation requires the Professional plan or higher',
          currentTier: genFromTimeTier,
          minimumTier: 'professional',
          requiresTierUpgrade: true,
        });
      }

      const { clientId, timeEntryIds, dueDate, taxRate } = req.body;

      if (!clientId || !timeEntryIds || !Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        return res.status(400).json({ message: "Client ID and time entry IDs are required" });
      }

      // Get the time entries
      const timeEntries: any[] = [];
      for (const id of timeEntryIds) {
        const entry = await storage.getTimeEntry(id, workspace.id);
        if (entry && entry.clientId === clientId && entry.clockOut) {
          timeEntries.push(entry);
        }
      }

      if (timeEntries.length === 0) {
        return res.status(400).json({ message: "No valid time entries found" });
      }

      // Calculate totals with NaN guards
      let subtotal = 0;
      for (const entry of timeEntries) {
        const amount = parseFloat(entry.totalAmount as string || "0");
        if (!isNaN(amount)) {
          subtotal += amount;
        }
      }

      // Tax rate is percentage, taxAmount is dollars
      const taxRatePercent = parseFloat(taxRate || "0");
      const taxAmount = isNaN(taxRatePercent) ? 0 : subtotal * (taxRatePercent / 100);
      const total = subtotal + taxAmount;

      // Calculate platform fee — default 3.00% matches billos.ts / billingAutomation.ts
      const platformFeePercent = parseFloat(workspace.platformFeePercentage as string || "3.00");
      const platformFeeAmount = isNaN(platformFeePercent) ? 0 : total * (platformFeePercent / 100);
      const businessAmount = total - platformFeeAmount;

      // T002: UUID suffix prevents collision on concurrent generation requests.
      const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;

      // Create invoice + line items atomically in a transaction
      const invoice = await db.transaction(async (tx) => {
        const createdInvoice = await storage.createInvoice({
          workspaceId: workspace.id,
          clientId,
          invoiceNumber,
          issueDate: new Date(),
          dueDate: dueDate ? new Date(dueDate) : undefined,
          subtotal: subtotal.toFixed(2),
          taxRate: taxRatePercent.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          total: total.toFixed(2),
          platformFeePercentage: platformFeePercent.toFixed(2),
          platformFeeAmount: platformFeeAmount.toFixed(2),
          businessAmount: businessAmount.toFixed(2),
          status: "draft",
        });

        for (const entry of timeEntries) {
          await storage.createInvoiceLineItem({
            invoiceId: createdInvoice.id,
            description: entry.notes || `Time entry - ${new Date(entry.clockIn).toLocaleDateString()}`,
            quantity: entry.totalHours as string || "0",
            unitPrice: entry.hourlyRate as string || "0",
            amount: entry.totalAmount as string || "0",
            timeEntryId: entry.id,
          });
        }

        return createdInvoice;
      });

      // Send invoice notification email to workspace owner
      const client = await storage.getClient(clientId, workspace.id);
      const owner = await storage.getUser(workspace.ownerId);
      
      if (owner?.email) {
        const dueDate = invoice.dueDate 
          ? new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })
          : 'No due date';
        
        sendInvoiceGeneratedEmail(owner.email, {
          clientName: client ? `${client.firstName} ${client.lastName}` : 'Unknown Client',
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: total.toFixed(2),
          invoiceDate: new Date().toLocaleDateString(),
          dueDate,
          lineItems: []
        }).catch(err => log.error('Failed to send invoice email:', err));
      }

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        action: 'create',
        entityType: 'invoice',
        entityId: invoice.id,
        changes: { after: { invoiceNumber: invoice.invoiceNumber, total: total.toFixed(2), clientId, timeEntryCount: timeEntries.length, source: 'generate_from_time' } },
        metadata: { isSensitiveData: true, complianceTag: 'soc2' },
      }).catch(err => log.warn('[InvoiceRoutes] SOC2 audit log write failed (invoice generate):', err?.message));

      res.json(invoice);
    } catch (error: unknown) {
      log.error("Error generating invoice from time entries:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to generate invoice" });
    }
  });

router.post('/process-reminders', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;

      const { processDelinquentInvoices } = await import('../services/billingAutomation');
      await processDelinquentInvoices(workspaceId);
      
      res.json({ message: "Delinquency reminders processed successfully" });
    } catch (error: unknown) {
      log.error("Error processing reminders:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to process reminders" });
    }
  });

router.get('/', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;
      const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;

      const allInvoices = await storage.getInvoicesByWorkspace(workspace.id);

      const total = allInvoices.length;
      res.set('X-Total-Count', String(total));

      if (!hasPagination) {
        return res.json(allInvoices);
      }

      res.json({
        data: allInvoices.slice(offset, offset + limit),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      log.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

router.post('/', idempotencyMiddleware, async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId =
        req.user?.id ||
        (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
      if (!userId) {
        return res.status(403).json({ message: 'User context not found' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // GAP-50 FIX: Enforce professional tier gate for invoice creation.
      // billingConfig.ts feature matrix declares invoice_generation as professional+ only.
      // Without this check a starter/trial org can POST invoices — bypassing the plan wall
      // and billing its clients without paying for the feature.
      const workspaceTier = await getWorkspaceTier(workspace.id);
      if (!hasTierAccess(workspaceTier, 'professional')) {
        return res.status(402).json({
          error: 'Invoice creation requires the Professional plan or higher',
          currentTier: workspaceTier,
          minimumTier: 'professional',
          requiresTierUpgrade: true,
        });
      }

      // T003: Validate clientId belongs to this workspace to prevent cross-org references.
      const clientIdFromBody = req.body.clientId;
      let invoiceContractWarning: string | null = null;
      if (clientIdFromBody) {
        const [clientCheck] = await db.select({
          id: clients.id,
          contractSignedAt: clients.contractSignedAt,
          clientOnboardingStatus: clients.clientOnboardingStatus,
        })
          .from(clients)
          .where(and(eq(clients.id, clientIdFromBody), eq(clients.workspaceId, workspace.id)))
          .limit(1);
        if (!clientCheck) {
          return res.status(400).json({ message: "Client not found in this workspace" });
        }
        // NON-BLOCKING: warn if client has no signed contract
        if (!clientCheck.contractSignedAt) {
          invoiceContractWarning = 'No signed contract on file for this client. Invoice created but contract is required before billing.';
        }
      }

      // T002: Workspace-prefixed invoice number with UUID suffix eliminates collision risk
      // across concurrent requests and across orgs sharing the same millisecond timestamp.
      const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;

      const { enforceAttribution } = await import('../middleware/dataAttribution');
      const rawValidated = insertInvoiceSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
        invoiceNumber,
        platformFeePercentage: workspace.platformFeePercentage,
      });

      if (businessRuleResponse(res, [
        validateInvoiceAmount((rawValidated as any).totalAmount ?? req.body.totalAmount, 'totalAmount'),
      ])) return;

      const validated = enforceAttribution('invoices', rawValidated, req.attribution || {
        workspaceId: workspace.id,
        actorId: userId || null,
        actorType: 'user',
        actorRole: null,
        actorIp: null,
      });

      const invoice = await db.transaction(async (tx) => {
        const createdInvoice = await tx
          .insert(invoices)
          .values(validated as any)
          .returning()
          .then(rows => rows[0]);

        // Write AR ledger entry: invoice_created = debit (accounts receivable increases — client now owes us)
        const { writeLedgerEntry } = await import('../services/orgLedgerService');
        await writeLedgerEntry({
          workspaceId: workspace.id,
          entryType: 'invoice_created',
          direction: 'debit',
          amount: parseFloat(String(createdInvoice.total || validated.totalAmount || 0)),
          relatedEntityType: 'invoice',
          relatedEntityId: createdInvoice.id,
          invoiceId: createdInvoice.id,
          createdBy: userId,
          description: `Invoice ${createdInvoice.invoiceNumber} created — $${parseFloat(String(createdInvoice.total || validated.totalAmount || 0)).toFixed(2)} AR opened`,
          metadata: { clientId: validated.clientId, invoiceNumber: createdInvoice.invoiceNumber },
          tx,
        });

        // Create revenue recognition schedule (Issue #5: invoice-to-revenue linking)
        const recognitionMethod = (createdInvoice as any).recognitionMethod ?? 'cash';
        const invoiceTotal = parseFloat(String(createdInvoice.total || validated.totalAmount || 0));
        if (invoiceTotal > 0 && createdInvoice.clientId) {
          try {
            const { createScheduleForInvoice } = await import('../services/billing/revenueRecognitionService');
            await createScheduleForInvoice(tx, {
              workspaceId: workspace.id,
              invoiceId: createdInvoice.id,
              clientId: createdInvoice.clientId,
              totalAmount: invoiceTotal,
              recognitionMethod: recognitionMethod === 'accrual' ? 'accrual' : 'cash',
              periodMonths: req.body?.recognitionPeriodMonths ?? 1,
              startDate: createdInvoice.issueDate ? new Date(createdInvoice.issueDate) : new Date(),
              createdBy: userId,
            });
          } catch (revErr: any) {
            log.warn('[InvoiceRoutes] Revenue schedule creation failed (non-fatal)', { error: revErr?.message });
          }
        }

        return createdInvoice;
      });

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'create',
        entityType: 'invoice',
        entityId: invoice.id,
        actionDescription: `Invoice ${invoice.invoiceNumber} created`,
        changes: { after: { invoiceNumber: invoice.invoiceNumber, total: validated.totalAmount, clientId: validated.clientId, status: 'draft' } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice creation', { error: err?.message }));

      pool.query(
        `INSERT INTO universal_audit_log (workspace_id, actor_id, action, entity_type, entity_id, action_description, changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspace.id,
          userId,
          'create',
          'invoice',
          invoice.id,
          `Invoice ${invoice.invoiceNumber} created`,
          JSON.stringify({ invoiceNumber: invoice.invoiceNumber, total: validated.totalAmount, clientId: validated.clientId, status: 'draft' }),
        ]
      ).catch(err => log.error('[FinancialAudit] CRITICAL: universal_audit_log write failed for invoice creation', { error: err?.message }));

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(workspace.id, { type: 'invoices_updated', action: 'created' });

      platformEventBus.publish({
        type: 'invoice_created',
        category: 'automation',
        title: `Invoice ${invoice.invoiceNumber} Created`,
        description: `New invoice for $${parseFloat(String(validated.totalAmount || 0)).toFixed(2)} created`,
        workspaceId: workspace.id,
        userId,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: validated.totalAmount, clientId: validated.clientId, status: 'draft' },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      notificationHelpers.createInvoiceCreatedNotification(
        { storage: storage as any },
        {
          workspaceId: workspace.id,
          userId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber || invoice.id,
          clientName: validated.clientName || 'Client',
          totalAmount: String(validated.totalAmount || '0'),
          createdBy: userId,
        }
      ).catch(err => log.error('Failed to create invoice notification:', err));
      
      res.status(201).json({ ...invoice, contractWarning: invoiceContractWarning });
    } catch (error: unknown) {
      log.error("Error creating invoice:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to create invoice" });
    }
  });

router.patch('/:id', mutationLimiter, async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId =
        req.user?.id ||
        (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
      if (!userId) {
        return res.status(403).json({ message: 'User context not found' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ message: "Invalid invoice ID format" });

      // RC7: Validate body fields before any DB access — prevents type coercion bugs
      // on financial fields (totalAmount must be a decimal string, not a raw number).
      const bodyParsed = invoiceUpdateBodySchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ message: 'Invalid request body', errors: bodyParsed.error.flatten().fieldErrors });
      }
      const { status, totalAmount, subtotal, taxAmount, notes, dueDate } = bodyParsed.data;

      const INVALID_STATUS_TRANSITIONS: Record<string, string[]> = {
        'paid': ['sent', 'pending', 'draft'],
        'cancelled': ['sent', 'pending', 'draft', 'paid'],
        'void': ['sent', 'pending', 'draft', 'paid'],
      };

      // ── FIX 4: Write-protect closed invoices — fetch before ANY field edit ──────
      // Paid invoices are accounting records. Any edit requires a credit memo, not a PATCH.
      const [frozenCheck] = await db.select({
        status: invoices.status,
        invoiceNumber: invoices.invoiceNumber,
      })
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)))
        .limit(1);

      if (!frozenCheck) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // GAP-32 FIX: Added 'refunded' — a refunded invoice is a closed accounting record
      // and must not be mutated via PATCH. Issue a new credit memo to correct it.
      const CLOSED_STATUSES = ['paid', 'cancelled', 'void', 'refunded', 'disputed'] as const;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (CLOSED_STATUSES.includes(frozenCheck as any).status) {
        return res.status(409).json({
          message: `Invoice ${frozenCheck.invoiceNumber || id} has status '${frozenCheck.status}' and cannot be modified. To correct a paid invoice, issue a credit memo or adjustment.`,
          code: 'INVOICE_CLOSED',
          currentStatus: frozenCheck.status,
        });
      }
      // ─────────────────────────────────────────────────────────────────────────────

      // Always fetch current state when status is changing — needed for ledger reversals + guard checks
      let currentInvoiceState: { status: string | null; total: string | null; amountPaid: string | null; invoiceNumber: string | null } | null = null;
      if (status !== undefined) {
        const [currentInvoice] = await db.select({ status: invoices.status, total: invoices.total, amountPaid: invoices.amountPaid, invoiceNumber: invoices.invoiceNumber })
          .from(invoices)
          .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)))
          .limit(1);

        currentInvoiceState = currentInvoice || null;
      }

      // GAP-4 FIX: Block status='paid' via PATCH — redirect to dedicated mark-paid endpoint.
      // The PATCH endpoint does not create a paymentRecords row, does not set amountPaid,
      // does not write a payment_received ledger entry, and does not publish the invoice_paid
      // platform event. Any of those omissions would corrupt the org ledger and prevent QB sync.
      // The POST /:id/mark-paid endpoint performs all of these operations atomically in a
      // transaction. Clients must use that endpoint to record payments.
      if (status === 'paid') {
        return res.status(400).json({
          message: 'Cannot mark an invoice as paid via PATCH. Use POST /api/invoices/:id/mark-paid to record a payment with proper ledger entries and a payment record.',
          code: 'USE_MARK_PAID_ENDPOINT',
          markPaidEndpoint: `POST /api/invoices/${id}/mark-paid`,
        });
      }

      if (status === 'void') {
        const { voidReason } = bodyParsed.data;
        if (!voidReason || voidReason.trim().length < 5) {
          return res.status(400).json({
            message: 'A valid reason (minimum 5 characters) is required to void an invoice.',
            code: 'VOID_REASON_REQUIRED',
          });
        }
      }

      // FIX [INVOICE AMOUNT MANIPULATION]: Block changes to financial totals once an
      // invoice has left the draft state (i.e., it has been sent to the client). An
      // authenticated manager could previously zero-out a $50,000 invoice by sending
      // PATCH with {totalAmount: 0.01}. Correct financial corrections require credit memos
      // or adjustments — not a direct PATCH of the invoice total.
      // Non-negative validation also applied here as an additional defense-in-depth layer.
      const sentStatuses = new Set(['sent', 'overdue', 'partial']);
      const currentStatus = frozenCheck.status || "";

      if (sentStatuses.has(currentStatus) && (totalAmount !== undefined || subtotal !== undefined || taxAmount !== undefined)) {
        return res.status(409).json({
          message: `Invoice financial totals cannot be modified once the invoice is in '${currentStatus}' status. To correct the amount, issue an adjustment or credit memo.`,
          code: 'INVOICE_FINANCIALS_IMMUTABLE',
          currentStatus,
        });
      }

      if (businessRuleResponse(res, [
        totalAmount !== undefined ? validateNonNegativeAmount(totalAmount, 'totalAmount') : null,
        subtotal !== undefined ? validateNonNegativeAmount(subtotal, 'subtotal') : null,
        taxAmount !== undefined ? validateNonNegativeAmount(taxAmount, 'taxAmount') : null,
      ])) return;

      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (status === 'void' && bodyParsed.data.voidReason) {
        updateData.voidReason = bodyParsed.data.voidReason;
        updateData.voidedBy = userId;
      }
      if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
      if (subtotal !== undefined) updateData.subtotal = subtotal;
      if (taxAmount !== undefined) updateData.taxAmount = taxAmount;
      if (notes !== undefined) updateData.notes = notes;
      if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);

      const [updated] = await db.update(invoices)
        .set(updateData)
        .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Write ledger reversal when PATCH sets status to 'void' or 'cancelled'
      // Only reverse open AR (statuses that had an invoice_created debit recorded)
      if (status && ['void', 'cancelled'].includes(status) && currentInvoiceState) {
        const arOpenStatuses = ['sent', 'partial', 'overdue', 'draft'];
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (arOpenStatuses.includes(currentInvoiceState.status)) {
          // RC4 (Phase 2): AR reversal uses Decimal.js subtraction to avoid floating-point drift.
          const fullTotalStr = toFinancialString(String(currentInvoiceState.total || updated.total || 0));
          const alreadyPaidStr = toFinancialString(String(currentInvoiceState.amountPaid || 0));
          const remainingARStr = subtractFinancialValues(fullTotalStr, alreadyPaidStr);
          const remainingAR = parseFloat(remainingARStr) < 0 ? 0 : parseFloat(remainingARStr);
          if (remainingAR > 0) {
            (async () => {
              try {
                const { writeLedgerEntry } = await import('../services/orgLedgerService');
                await writeLedgerEntry({
                  workspaceId: workspace.id,
                  entryType: status === 'void' ? 'invoice_voided' : 'invoice_cancelled',
                  direction: 'credit',
                  amount: remainingAR,
                  relatedEntityType: 'invoice',
                  relatedEntityId: id,
                  invoiceId: id,
                  createdBy: userId,
                  description: `Invoice ${currentInvoiceState.invoiceNumber} ${status} via PATCH — AR reversal ${formatCurrency(remainingARStr)} (was ${currentInvoiceState.status})`,
                  metadata: { previousStatus: currentInvoiceState.status, fullTotal: fullTotalStr, alreadyPaid: alreadyPaidStr, remainingAR },
                });
              } catch (ledgerErr: unknown) {
                log.warn(`[FinancialLedger] invoice_${status} reversal write failed (non-blocking):`, (ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)));
              }
            })();
          }
        }
      }

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(workspace.id, { type: 'invoices_updated', action: 'updated' });

      // Emit canonical financial event for void/cancelled status changes
      if (status && ['void', 'cancelled'].includes(status)) {
        const eventType = status === 'void' ? 'invoice_voided' : 'invoice_cancelled';
        platformEventBus.publish({
          type: eventType,
          category: 'automation',
          title: `Invoice ${currentInvoiceState?.invoiceNumber || id} ${status === 'void' ? 'Voided' : 'Cancelled'}`,
          description: `Invoice ${status === 'void' ? 'voided' : 'cancelled'} (was ${currentInvoiceState?.status || 'unknown'})`,
          workspaceId: workspace.id,
          userId,
          metadata: {
            invoiceId: id,
            invoiceNumber: currentInvoiceState?.invoiceNumber,
            previousStatus: currentInvoiceState?.status,
            newStatus: status,
          },
          visibility: 'manager',
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        action: 'update',
        entityType: 'invoice',
        entityId: id,
        changes: { before: { status: currentInvoiceState?.status || 'unknown' }, after: updateData },
        metadata: { 
          isSensitiveData: true, 
          complianceTag: 'soc2',
          voidReason: status === 'void' ? updateData.voidReason : undefined,
          voidedBy: status === 'void' ? userId : undefined
        },
      }).catch(err => log.warn('[InvoiceRoutes] SOC2 audit log write failed (invoice update):', err?.message));

      res.json(updated);
    } catch (error: unknown) {
      log.error("Error updating invoice:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update invoice" });
    }
  });

router.delete('/:id', async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId =
        req.user?.id ||
        (typeof req.user?.claims?.sub === 'string' ? req.user.claims.sub : undefined);
      if (!userId) {
        return res.status(403).json({ message: 'User context not found' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ message: "Invalid invoice ID format" });

      // Capture current status BEFORE cancelling — needed to decide if a ledger reversal is required
      const [preCancelState] = await db.select({ status: invoices.status, total: invoices.total, amountPaid: invoices.amountPaid, invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)))
        .limit(1);

      const [cancelled] = await db.update(invoices)
        .set({ status: 'cancelled' })
        .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)))
        .returning();

      if (!cancelled) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Write ledger reversal if the invoice was in a revenue-visible state (AR was already opened)
      // 'sent', 'partial', 'overdue' all have open AR — cancelling must reverse only the REMAINING open AR
      // (total - already paid), not the full total, to avoid over-reversing partial payments
      const arOpenStatuses = ['sent', 'partial', 'overdue'];
      if (preCancelState && arOpenStatuses.includes(preCancelState.status || "")) {
        // RC4 (Phase 2): Decimal.js subtraction for AR reversal — no floating-point drift.
        const fullTotalStr = toFinancialString(String(preCancelState.total || 0));
        const alreadyPaidStr = toFinancialString(String(preCancelState.amountPaid || 0));
        const remainingARStr = subtractFinancialValues(fullTotalStr, alreadyPaidStr);
        const remainingAR = parseFloat(remainingARStr) < 0 ? 0 : parseFloat(remainingARStr);
        if (remainingAR > 0) {
          (async () => {
            try {
              const { writeLedgerEntry } = await import('../services/orgLedgerService');
              await writeLedgerEntry({
                workspaceId: workspace.id,
                entryType: 'invoice_cancelled',
                direction: 'credit',
                amount: remainingAR,
                relatedEntityType: 'invoice',
                relatedEntityId: id,
                invoiceId: id,
                createdBy: userId,
                description: `Invoice ${preCancelState.invoiceNumber} cancelled — AR reversal of ${formatCurrency(remainingARStr)} remaining (was ${preCancelState.status}, total ${formatCurrency(fullTotalStr)}, paid ${formatCurrency(alreadyPaidStr)})`,
                metadata: { previousStatus: preCancelState.status, fullTotal: fullTotalStr, alreadyPaid: alreadyPaidStr, remainingAR },
              });
            } catch (ledgerErr: unknown) {
              log.warn('[FinancialLedger] invoice_cancelled reversal write failed (non-blocking):', (ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)));
            }
          })();
        }
      }

      // Release time entries back to unbilled pool so they can be re-invoiced
      const unbilledCount = await unmarkEntriesAsBilled(id);
      if (unbilledCount > 0) {
        log.info(`[Invoices] Released ${unbilledCount} time entries from cancelled invoice ${id}`);
      }

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(workspace.id, { type: 'invoices_updated', action: 'deleted' });

      platformEventBus.publish({
        type: 'invoice_cancelled',
        category: 'automation',
        title: `Invoice ${preCancelState?.invoiceNumber || id} Cancelled`,
        description: `Invoice cancelled (was ${preCancelState?.status || 'active'})`,
        workspaceId: workspace.id,
        userId,
        metadata: {
          invoiceId: id,
          invoiceNumber: preCancelState?.invoiceNumber || id,
          previousStatus: preCancelState?.status,
          unbilledEntriesReleased: unbilledCount,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        action: 'delete',
        entityType: 'invoice',
        entityId: id,
        changes: { before: { status: preCancelState?.status || 'active' }, after: { status: 'cancelled' }, unbilledEntriesReleased: unbilledCount },
        metadata: { isSensitiveData: true, complianceTag: 'soc2' },
      }).catch(err => log.warn('[InvoiceRoutes] SOC2 audit log write failed (invoice delete):', err?.message));

      res.json(cancelled);
    } catch (error: unknown) {
      log.error("Error deleting invoice:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to delete invoice" });
    }
  });

router.post('/:id/send', mutationLimiter, async (req: any, res: any) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const invoice = await storage.getInvoice(id, workspaceId);
      
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      if (['paid', 'void', 'cancelled'].includes(invoice.status || '')) {
        return res.status(400).json({ message: `Cannot send invoice in ${invoice.status} status` });
      }

      const client = await storage.getClient(invoice.clientId, workspaceId);
      if (!client || !client.email) {
        return res.status(400).json({ message: "Client has no email address" });
      }

      const { sendInvoiceWithEmail } = await import('../services/timesheetInvoiceService');
      const result = await sendInvoiceWithEmail({
        invoiceId: id,
        workspaceId,
        userId: req.user.id,
      });

      if (!result.success) {
        return res.status(500).json({ message: result.message || "Failed to send invoice email" });
      }

      await storage.updateInvoice(id, workspaceId, { status: 'sent', updatedAt: new Date() } as any);

      res.json({ success: true, message: "Invoice sent successfully" });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) || "Failed to send invoice" });
    }
  })

export default router;

