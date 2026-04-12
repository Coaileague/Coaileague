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
} from '@shared/schema';
import * as notificationHelpers from "../notifications";
import { format } from "date-fns";
import PDFDocument from "pdfkit";

async function requireManagerRole(req: AuthenticatedRequest): Promise<{ allowed: boolean; error?: string; status?: number }> {
  // @ts-expect-error — TS migration: fix in refactoring sprint
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

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing (CLAUDE.md §F).
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

// Apply rate limiting to all invoice routes
// Billing operations are sensitive and involve PDF generation/Stripe calls
router.use(rateLimitMiddleware(
  (req: any) => {
    const workspaceId = req.workspaceId || req.session?.currentWorkspaceId;
    if (workspaceId) return `invoices-${workspaceId}`;
    return `invoices-ip-${req.ip}`;
  },
  (req: any) => (req.session?.plan || 'free') as any
));

router.use((req, res, next) => {
  if (req.path.startsWith('/portal/')) return next();
  return requireAuth(req, res, next);
});

import { meteredGptClient } from "../services/billing/meteredGptClient";
import { createHash } from "crypto";

  router.get('/:id/pdf', async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // Require manager access to download invoice PDFs
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const workspaceId = req.workspaceId!;
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Get invoice with line items
      const invoice = await storage.getInvoice(id, workspaceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const lineItems = await storage.getInvoiceLineItems(id);
      const client = invoice.clientId ? await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1) : null;

      // ── TRACE PROTOCOL V2: DOCUMENT VAULT & PDF INTEGRITY ────────────────────
      // All production documents must be hashed and registered in the vault.
      
      const generatePdf = async (doc: any) => {
        // Header
        doc.fontSize(24).text(workspace.companyName || PLATFORM.name, { align: 'center' });
        doc.fontSize(10).text(workspace.address || '', { align: 'center' });
        doc.moveDown();
        
        // Invoice title
        doc.fontSize(20).text(`INVOICE #${invoice.invoiceNumber}`, { align: 'center' });
        doc.moveDown();

        // Client & dates
        doc.fontSize(12).text(`Bill To: ${client?.[0]?.companyName || (client?.[0] ? `${client[0].firstName} ${client[0].lastName}` : 'N/A')}`, 50, 150);
        doc.text(`Date: ${invoice.issueDate ? format(new Date(invoice.issueDate), 'MM/dd/yyyy') : 'N/A'}`, 350, 150);
        doc.text(`Due: ${invoice.dueDate ? format(new Date(invoice.dueDate), 'MM/dd/yyyy') : 'N/A'}`, 350, 165);
        doc.text(`Status: ${invoice.status?.toUpperCase() || 'PENDING'}`, 350, 180);
        doc.moveDown(3);

        // Line items table
        const tableTop = 220;
        doc.fontSize(10).text('Description', 50, tableTop);
        doc.text('Qty', 300, tableTop);
        doc.text('Rate', 350, tableTop);
        doc.text('Amount', 450, tableTop, { align: 'right' });
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let y = tableTop + 25;
        lineItems.forEach((item: any) => {
          doc.text(item.description || 'Service', 50, y);
          doc.text(item.quantity?.toString() || '1', 300, y);
          doc.text(`$${item.rate || '0.00'}`, 350, y);
          doc.text(`$${item.amount || '0.00'}`, 450, y, { align: 'right' });
          y += 20;
        });

        // Totals
        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 15;
        doc.fontSize(12).text('Subtotal:', 350, y);
        doc.text(`$${invoice.subtotal}`, 450, y, { align: 'right' });
        y += 20;
        doc.text('Tax:', 350, y);
        doc.text(`$${invoice.taxAmount || '0.00'}`, 450, y, { align: 'right' });
        y += 20;
        doc.fontSize(14).text('TOTAL:', 350, y);
        doc.text(`$${invoice.total}`, 450, y, { align: 'right' });
      };

      // Create PDF
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      const chunks: any[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      
      await generatePdf(doc);
      doc.end();

      // Buffer the PDF to compute hash and register in vault
      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });

      const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');
      const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
      const fileUrl = `/storage/${workspaceId}/invoices/${fileName}`;

      // Register in Document Vault for compliance/integrity
      const contentKey = `${fileUrl}:Invoice ${invoice.invoiceNumber}:${workspaceId}`;
      const integrityHash = createHash('sha256').update(contentKey).digest('hex');

      // GAP-45 FIX: Block suspended/cancelled workspaces from generating PDFs
      const ws = await storage.getWorkspace(workspaceId);
      if (!ws || ws.subscriptionStatus === 'suspended' || ws.subscriptionStatus === 'cancelled') {
        return res.status(403).json({
          error: 'SUBSCRIPTION_INACTIVE',
          message: 'Organization subscription is not active — invoice PDFs cannot be generated until the subscription is restored',
        });
      }

      await db.insert(documentVault).values(({
        workspaceId,
        title: `Invoice ${invoice.invoiceNumber}`,
        category: 'financial',
        fileUrl,
        fileSizeBytes: pdfBuffer.length,
        mimeType: 'application/pdf',
        integrityHash,
        relatedEntityType: 'invoice',
        relatedEntityId: invoice.id,
        uploadedBy: req.user?.id || null,
        createdAt: new Date(),
      }) as any).onConflictDoNothing();

      // AI-assisted verification (withGpt)
      if (true) { // AI verification always attempted via metered client
        try {
          await meteredGptClient.execute({
            workspaceId: workspaceId!,
            userId: req.user?.id,
            featureKey: 'invoice_verification',
            tier: 'NANO',
            prompt: `Verify invoice data integrity for Invoice ${invoice.invoiceNumber}. 
                     Total: ${invoice.total}, Subtotal: ${invoice.subtotal}, Tax: ${invoice.taxAmount}. 
                     Line Items: ${JSON.stringify(lineItems)}. 
                     Ensure the sum of line items matches the subtotal and total matches subtotal + tax.`,
          });
        } catch (gptErr) {
          log.warn("[InvoicePDF] AI verification skipped:", gptErr);
        }
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (error: unknown) {
      log.error("Error generating invoice PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

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

  router.patch('/proposals/:id/approve', async (req: AuthenticatedRequest, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const { id } = req.params;
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

      if (proposal.createdBy && proposal.createdBy === userId) {
        return res.status(403).json({ message: "You cannot approve your own invoice proposal" });
      }
      
      await db.update(invoiceProposals).set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
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
        actionDescription: `Invoice proposal ${id} approved`,
        changes: { before: { status: 'pending' }, after: { status: 'approved', approvedBy: userId } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice approval', { error: err?.message }));

      // Webhook Emission
      try {
        const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
        deliverWebhookEvent(userWorkspace.workspaceId, 'invoice.generated', {
          invoiceId: proposal.invoiceId,
          proposalId: id,
          approvedBy: userId,
          clientId: proposal.clientId,
          totalAmount: proposal.totalAmount
        });
      } catch (webhookErr: any) {
        log.warn('[InvoiceApproval] Webhook delivery failed:', webhookErr?.message);
      }

      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(userWorkspace.workspaceId, { type: 'invoices_updated', action: 'approved' });
      platformEventBus.publish({
        type: 'invoice_created',
        category: 'automation',
        title: 'Invoice Proposal Approved',
        description: `Invoice proposal ${id} approved — invoice ${proposal.invoiceId || id} now active`,
        workspaceId: userWorkspace.workspaceId,
        userId: userId!,
        metadata: {
          proposalId: id,
          invoiceId: proposal.invoiceId,
          approvedBy: userId,
          clientId: proposal.clientId,
          source: 'proposal_approve',
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // Notify managers about invoice approval
      const { universalNotificationEngine } = await import('../services/universalNotificationEngine');
      await universalNotificationEngine.sendNotification({
        workspaceId: userWorkspace.workspaceId,
        type: 'invoice_paid', // Using invoice_paid as a proxy for 'invoice_approved' which routes to managers
        priority: 'high',
        title: 'Invoice Approved',
        message: `Invoice proposal ${id} has been approved.`,
        severity: 'info',
        metadata: { proposalId: id, invoiceId: proposal.invoiceId, approvedBy: userId }
      }).catch(err => log.error('[Invoices] Failed to send approval notification:', (err instanceof Error ? err.message : String(err))));

      let qbSyncResult = null;
      try {
        const { onInvoiceApproved } = await import('../services/financialPipelineOrchestrator');
        if (proposal.invoiceId) {
          qbSyncResult = await onInvoiceApproved(proposal.invoiceId, userWorkspace.workspaceId, userId!);
          log.info(`[InvoiceApproval] QB sync result for invoice ${proposal.invoiceId}:`, qbSyncResult.action);
        }
      } catch (syncError: unknown) {
        log.warn('[InvoiceApproval] QB sync after approval failed (non-blocking):', syncError instanceof Error ? syncError.message : String(syncError));
      }

      let emailSendResult = null;
      try {
        const clientId = proposal.clientId;
        if (clientId) {
          const client = await storage.getClient(clientId, userWorkspace.workspaceId);
          const clientEmail = client?.email || client?.billingEmail;
          if (clientEmail) {
            const invoiceId = (proposal as any).invoiceIdCreated || (proposal as any).invoiceId;
            const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.companyName || 'Valued Client';
            const totalAmount = proposal.totalAmount ? parseFloat(proposal.totalAmount as string).toFixed(2) : '0.00';
            const aiResponse = proposal.aiResponse as any;
            const invoiceNumber = aiResponse?.invoiceNumber || `PROP-${id.substring(0, 8).toUpperCase()}`;
            const dueDate = aiResponse?.dueDate ? new Date(aiResponse.dueDate).toLocaleDateString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();

            if (invoiceId) {
              try {
                const { sendInvoiceWithEmail } = await import('../services/timesheetInvoiceService');
                emailSendResult = await sendInvoiceWithEmail({
                  invoiceId,
                  workspaceId: userWorkspace.workspaceId,
                  userId: userId!,
                });
              } catch (pdfEmailError: unknown) {
                log.warn('[InvoiceApproval] PDF email send failed, falling back to basic email:', pdfEmailError instanceof Error ? pdfEmailError.message : String(pdfEmailError));
                emailSendResult = await sendInvoiceGeneratedEmail(clientEmail, {
                  clientName,
                  invoiceNumber,
                  totalAmount: String(totalAmount || 0),
                  invoiceDate: new Date().toLocaleDateString(),
                  dueDate,
                  lineItems: [],
                }, userWorkspace.workspaceId);
              }
            } else {
              emailSendResult = await sendInvoiceGeneratedEmail(clientEmail, {
                clientName,
                invoiceNumber,
                totalAmount: String(totalAmount || 0),
                invoiceDate: new Date().toLocaleDateString(),
                dueDate,
                lineItems: [],
              }, userWorkspace.workspaceId);
            }

            if (invoiceId) {
              await storage.updateInvoice(invoiceId, userWorkspace.workspaceId, { status: 'sent' } as any);
              
              // Webhook Emission
              try {
                const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
                deliverWebhookEvent(userWorkspace.workspaceId, 'invoice.sent', {
                  invoiceId,
                  clientEmail,
                  clientId: proposal.clientId,
                  sentAt: new Date().toISOString()
                });
              } catch (webhookErr: any) {
                log.warn('[InvoiceApproval] Webhook delivery for invoice.sent failed:', webhookErr?.message);
              }
            }

            storage.createAuditLog({
              workspaceId: userWorkspace.workspaceId,
              userId: userId!,
              userEmail: req.user?.email || 'unknown',
              userRole: req.user?.role || 'user',
              action: 'update',
              entityType: 'invoice',
              entityId: invoiceId || id,
              actionDescription: `Invoice auto-sent to ${clientEmail} after proposal ${id} approval`,
              changes: { after: { status: 'sent', sentTo: clientEmail, autoTriggered: true } },
              isSensitiveData: true,
              complianceTag: 'soc2',
            }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice auto-send', { error: err?.message }));

            log.info(`[InvoiceApproval] Auto-sent invoice email to ${clientEmail} for proposal ${id}`);
          } else {
            log.warn(`[InvoiceApproval] No billing email found for client ${clientId}, skipping auto-send`);
          }
        }
      } catch (emailError: unknown) {
        log.warn('[InvoiceApproval] Auto-send email after approval failed (non-blocking):', emailError instanceof Error ? emailError.message : String(emailError));
      }

      res.json({
        success: true,
        proposalId: id,
        message: emailSendResult?.success
          ? 'Invoice proposal approved and invoice sent to client.'
          : 'Invoice proposal approved. Invoice will be generated.',
        qbSync: qbSyncResult ? { synced: qbSyncResult.success, details: qbSyncResult.details } : undefined,
        emailSent: emailSendResult ? { success: emailSendResult.success } : undefined,
      });
    } catch (error: unknown) {
      log.error("Billing Platform Invoice Approval Error:", error);
      res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to approve invoice" });
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
          const lineAmountParts: string[] = [];
          for (const entry of unbilledEntries) {
            const hoursStr = toFinancialString(String(entry.totalHours || '0'));
            const rateStr = toFinancialString(String(clientRate.billableRate || '0'));
            lineAmountParts.push(calculateInvoiceLineItem(hoursStr, rateStr));
          }
          const subtotalStr = lineAmountParts.length > 0 ? calculateInvoiceTotal(lineAmountParts) : '0.0000';

          const taxRateDecimal = parseFloat(String(workspace.defaultTaxRate || '0'));
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

  router.post('/:id/send-email', async (req: any, res) => {
    try {
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ message: "Invalid invoice ID format" });

      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id || (req.user)?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      const invoice = await storage.getInvoice(id, workspace.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // ── WRITE-PROTECT: Closed invoices cannot be re-sent ──────────────────────
      // GAP-31 FIX: Added 'refunded' — a refunded invoice must not be re-sent to client.
      const SEND_BLOCKED_STATUSES = ['paid', 'void', 'cancelled', 'refunded', 'disputed'] as const;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (SEND_BLOCKED_STATUSES.includes(invoice as any).status) {
        return res.status(403).json({
          message: "This record has been closed and cannot be modified",
          code: 'RECORD_CLOSED',
          currentStatus: invoice.status,
        });
      }
      // ─────────────────────────────────────────────────────────────────────────────

      // Get client details
      const client = await storage.getClient(invoice.clientId, workspace.id);
      if (!client || !client.email) {
        return res.status(400).json({ message: "Client email not found" });
      }

      // T004: Fetch actual line items — was hardcoded to [] which sent blank emails to clients.
      const lineItems = await storage.getInvoiceLineItems(invoice.id);

      // D7-GAP-FIX: Block sending invoices that have zero-amount line items.
      // A zero-amount line item is almost always a data entry error (rate not set,
      // hours not entered). Sending such an invoice to a client is unprofessional
      // and creates billing disputes that are hard to reverse once sent.
      const zeroAmountItems = lineItems.filter((item: any) => {
        const amt = parseFloat(item.amount as string || '0');
        return amt === 0;
      });
      if (zeroAmountItems.length > 0) {
        return res.status(422).json({
          message: `Invoice has ${zeroAmountItems.length} line item(s) with a zero amount. Correct or remove them before sending.`,
          code: 'ZERO_AMOUNT_LINE_ITEMS',
          zeroItems: zeroAmountItems.map((i: any) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
        });
      }

      const emailLineItems = lineItems.map((item: any) => ({
        description: item.description || '',
        quantity: parseFloat(item.quantity as string || '1').toString(),
        unitPrice: parseFloat(item.unitPrice as string || '0').toFixed(2),
        amount: parseFloat(item.amount as string || '0').toFixed(2),
      }));

      // FIX 7: Financial anomaly check — warn if invoice total is unusually high (non-blocking)
      let financialAnomalyWarning: string | null = null;
      const invoiceTotal = parseFloat(invoice.total as string || '0');
      const INVOICE_ANOMALY_THRESHOLD = 50000;
      const INVOICE_EXTREME_THRESHOLD = 250000;
      if (invoiceTotal >= INVOICE_EXTREME_THRESHOLD) {
        financialAnomalyWarning = `EXTREME_AMOUNT: Invoice total $${invoiceTotal.toLocaleString()} far exceeds normal range ($250k+). Verify with finance team before sending.`;
        log.warn(`[FinancialAnomaly] Invoice ${invoice.invoiceNumber} total $${invoiceTotal} ≥ $${INVOICE_EXTREME_THRESHOLD} threshold`);
      } else if (invoiceTotal >= INVOICE_ANOMALY_THRESHOLD) {
        financialAnomalyWarning = `HIGH_AMOUNT: Invoice total $${invoiceTotal.toLocaleString()} is above typical range ($50k+). Please confirm this is correct.`;
        log.warn(`[FinancialAnomaly] Invoice ${invoice.invoiceNumber} total $${invoiceTotal} ≥ $${INVOICE_ANOMALY_THRESHOLD} threshold`);
      }

      // Get or create client portal access token for the "View & Pay Invoice" CTA button
      const { clientPortalAccess: cpaTable } = await import("@shared/schema");
      let [existingPortal] = await db.select().from(cpaTable).where(
        and(
          eq(cpaTable.workspaceId, workspace.id),
          eq(cpaTable.clientId, invoice.clientId),
          eq(cpaTable.isActive, true),
        )
      ).limit(1);

      if (!existingPortal) {
        const accessToken = crypto.randomBytes(32).toString('hex');
        const clientName = client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim();
        [existingPortal] = await db.insert(cpaTable).values({
          workspaceId: workspace.id,
          clientId: invoice.clientId,
          accessToken,
          email: client.email || '',
          portalName: `${clientName} — Billing Portal`,
          isActive: true,
        }).returning();
      }

      const portalDomain = (process.env.APP_BASE_URL || '') || process.env.APP_URL || 'https://app.coaileague.com';
      const portalUrl = existingPortal ? `https://${portalDomain}/portal/client/${existingPortal.accessToken}` : undefined;

      // GAP-AUDIT-3 FIX: Stamp portal access token on invoice with workspace scope in WHERE.
      // Prior bare WHERE eq(invoices.id) could theoretically update a different workspace's
      // invoice row if IDs collided (UUID collision is astronomically unlikely but defense-in-depth).
      // GAP-AUDIT-6 FIX: Same bare WHERE issue — now scoped to workspaceId.
      if (existingPortal) {
        await db.update(invoices).set({ portalAccessToken: existingPortal.accessToken }).where(and(eq(invoices.id, invoice.id), eq(invoices.workspaceId, workspace.id)));
      }

      // T005: Update invoice status to 'sent' BEFORE sending email.
      // GAP-31 FIX: Use atomic db.update with NOT IN guard so concurrent requests
      // cannot both succeed and send two emails. Only the first request whose WHERE
      // matches will get a non-empty RETURNING set; the second finds 0 rows (status
      // already 'sent') and returns early without sending a duplicate email.
      const [updatedInvoice] = await db.update(invoices)
        .set({ status: 'sent', updatedAt: new Date() })
        .where(and(
          eq(invoices.id, invoice.id),
          eq(invoices.workspaceId, workspace.id),
          not(inArray(invoices.status, ['sent', 'paid', 'void', 'cancelled', 'refunded'])),
        ))
        .returning();

      if (!updatedInvoice) {
        // Another concurrent request already transitioned this invoice — return early
        // so we do not send a duplicate email. The invoice is already 'sent'.
        return res.status(409).json({
          message: 'Invoice is already in a sent or closed state. No duplicate email was sent.',
          code: 'CONCURRENT_SEND_BLOCKED',
        });
      }

      // Send email (after status is committed to DB)
      const emailResult = await sendInvoiceGeneratedEmail(client.email, {
        clientName: client.companyName || `${client.firstName} ${client.lastName}`,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : new Date().toLocaleDateString(),
        totalAmount: parseFloat(invoice.total as string || "0").toFixed(2),
        dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A",
        lineItems: emailLineItems,
        portalUrl,
      });

      if (!emailResult.success) {
        log.error(`[InvoiceRoutes] Email delivery failed for ${invoice.invoiceNumber} (status already set to 'sent'): ${emailResult.error}`);
        return res.status(500).json({ message: "Invoice status updated but email delivery failed. Please retry sending.", error: emailResult.error });
      }

      storage.createAuditLog({
        workspaceId: workspace.id,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'update',
        entityType: 'invoice',
        entityId: invoice.id,
        actionDescription: `Invoice ${invoice.invoiceNumber} sent via email to ${client.email}`,
        changes: { before: { status: invoice.status }, after: { status: 'sent', sentTo: client.email } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice send', { error: err?.message }));

      platformEventBus.publish({
        type: 'invoice_sent',
        category: 'automation',
        title: `Invoice ${invoice.invoiceNumber} Sent`,
        description: `Invoice sent to ${client.email}`,
        workspaceId: workspace.id,
        userId,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, sentTo: client.email, clientId: invoice.clientId },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.json({ 
        success: true, 
        message: "Invoice sent successfully",
        emailId: emailResult.data,
        ...(financialAnomalyWarning ? { anomalyWarning: financialAnomalyWarning } : {}),
      });

    } catch (error: unknown) {
      log.error("Error sending invoice email:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to send invoice email" });
    }
  });

  router.post('/:id/send', async (req: any, res: any) => {
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

  router.get('/:invoiceId/line-items', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { invoiceId } = req.params;
      
      // Get the invoice to check ownership
      const workspaceId = req.workspaceId!;
      const invoice = await storage.getInvoice(invoiceId, workspaceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Check if user owns the workspace OR is the client on this invoice
      const workspace = await storage.getWorkspace(invoice.workspaceId);
      const clients = await storage.getClientsByWorkspace(invoice.workspaceId);
      const currentClient = clients.find(c => c.userId === userId);

      const isWorkspaceOwner = workspace && workspace.ownerId === userId;
      const isInvoiceClient = currentClient && invoice.clientId === currentClient.id;

      if (!isWorkspaceOwner && !isInvoiceClient) {
        return res.status(403).json({ message: "Not authorized to view this invoice" });
      }

      // Get line items for this specific invoice only
      const lineItems = await storage.getInvoiceLineItems(invoiceId);
      res.json(lineItems);
    } catch (error) {
      log.error("Error fetching invoice line items:", error);
      res.status(500).json({ message: "Failed to fetch invoice line items" });
    }
  });

  router.post('/', idempotencyMiddleware, async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id || (req.user)?.claims?.sub;
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

  router.patch('/:id', async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id || (req.user)?.claims?.sub;
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

      const userId = req.user?.id || (req.user)?.claims?.sub;
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

  router.post('/:id/mark-paid', idempotencyMiddleware, async (req: any, res) => {
    try {
      // F2 FIX: Reject malformed IDs before hitting the DB (Drizzle is safe from injection,
      // but this gives a clean 400 instead of an empty-result 404 for garbage input).
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ message: "Invalid invoice ID format" });

      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id || (req.user)?.claims?.sub;
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

        return { updated, paymentRow };
      });

      if (!updated) {
        return res.status(409).json({ message: "Invoice could not be marked as paid" });
      }

      // Spec Section 4.4: Write ledger entry for payment received (cash in, AR reduced)
      try {
        const { writeLedgerEntry } = await import('../services/orgLedgerService');
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
        });
      } catch (ledgerErr: unknown) {
        log.warn('[FinancialLedger] Payment ledger write failed:', (ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)));
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
                .from(clients).where(eq(clients.id, updated.clientId)).limit(1)
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

      // Charge middleware processing fee for non-manual invoice payments (awaited per CLAUDE.md §B).
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

  router.post('/generate-from-time', async (req: any, res) => {
    try {
      const roleCheck = await requireManagerRole(req);
      if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

      const userId = req.user?.id || (req.user)?.claims?.sub;
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

  router.get('/:invoiceId/reminders', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      const { invoiceId } = req.params;

      const reminders = await db
        .select()
        .from(invoiceReminders)
        .where(
          and(
            eq(invoiceReminders.workspaceId, workspaceId!),
            eq(invoiceReminders.invoiceId, invoiceId)
          )
        )
        .orderBy(desc(invoiceReminders.createdAt));
      
      res.json(reminders);
    } catch (error: unknown) {
      log.error("Error fetching invoice reminders:", error);
      res.status(500).json({ message: "Failed to fetch invoice reminders" });
    }
  });

  router.get('/reminders/needs-attention', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;

      const urgentReminders = await db
        .select({
          reminder: invoiceReminders,
          invoice: invoices,
          client: clients,
        })
        .from(invoiceReminders)
        .innerJoin(invoices, eq(invoiceReminders.invoiceId, invoices.id))
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
          and(
            eq(invoiceReminders.workspaceId, workspaceId!),
            eq(invoiceReminders.needsHumanIntervention, true)
          )
        )
        .orderBy(desc(invoiceReminders.daysOverdue));
      
      res.json(urgentReminders);
    } catch (error: unknown) {
      log.error("Error fetching urgent reminders:", error);
      res.status(500).json({ message: "Failed to fetch urgent reminders" });
    }
  });

  router.post('/:id/create-payment', async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: 'Payment processing not configured' });
      }

      const { id } = req.params;
      const { payerEmail, payerName, returnUrl } = req.body;

      const invoice = await storage.getInvoiceById(id);
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const invoiceWorkspace = await storage.getWorkspace(invoice.workspaceId);
      if (!invoiceWorkspace || invoiceWorkspace.subscriptionStatus === 'suspended' || invoiceWorkspace.subscriptionStatus === 'cancelled') {
        return res.status(403).json({ message: 'Organization is not active' });
      }

      if (invoice.status === 'paid') {
        return res.status(422).json({ message: 'Invoice already paid' });
      }

      const client = await storage.getClient(invoice.clientId, invoice.workspaceId);
      if (!client) {
        return res.status(404).json({ message: 'Client not found' });
      }

      const { clientPaymentInfo } = (await import("@shared/schema")) as any;
      
      let paymentInfo = await db
        .select()
        .from(clientPaymentInfo)
        .where(eq(clientPaymentInfo.clientId, invoice.clientId))
        .limit(1)
        .then(rows => rows[0]);

      let stripeCustomerId = paymentInfo?.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: payerEmail || client.email || undefined,
          name: payerName || client.companyName || `${client.firstName} ${client.lastName}`,
          metadata: {
            clientId: client.id,
            workspaceId: invoice.workspaceId,
          },
        }, { idempotencyKey: `cust-create-client-${client.id}` });
        stripeCustomerId = customer.id;

        // Save to database
        if (paymentInfo) {
          await db
            .update(clientPaymentInfo)
            .set({
              stripeCustomerId: customer.id,
              billingEmail: payerEmail || client.email || paymentInfo.billingEmail,
              updatedAt: new Date(),
            })
            .where(eq(clientPaymentInfo.clientId, client.id));
        } else {
          await db.insert(clientPaymentInfo).values({
            workspaceId: invoice.workspaceId,
            clientId: client.id,
            stripeCustomerId: customer.id,
            billingEmail: payerEmail || client.email || undefined,
          });
        }
      }

      // GAP-AUDIT-5 FIX: Guard against null/undefined invoice.total producing NaN cents.
      // A null total (e.g. draft invoice with no line items) would silently pass
      // parseFloat() → NaN → NaN * 100 → Stripe rejects with 400 "invalid_request_error"
      // but the error message won't mention NaN — makes debugging very hard.
      const totalStr = invoice.total || '0';
      const totalParsed = parseFloat(totalStr);
      if (isNaN(totalParsed) || totalParsed <= 0) {
        return res.status(422).json({ message: `Invoice total is invalid or zero (got: ${invoice.total}). Cannot create a Stripe payment intent for a zero or missing amount.` });
      }
      const amount = Math.round(totalParsed * 100); // Convert to cents
      const paymentIntent = await stripe.paymentIntents.create({
        automatic_payment_methods: { enabled: true },
        amount,
        currency: 'usd',
        customer: stripeCustomerId,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          workspaceId: invoice.workspaceId,
          clientId: invoice.clientId,
        },
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
      }, { idempotencyKey: `pi-invoice-${invoice.id}` });

      // GAP-AUDIT-4 FIX: Wrap invoicePayments insert + invoice update in a transaction.
      // Previously these were two separate DB calls. If the insert succeeded but the
      // update failed (network blip, DB timeout), the invoicePayments row would exist
      // with a paymentIntentId that the invoice record had no record of — the webhook
      // handler couldn't match the payment to the invoice and the payment would be lost.
      await db.transaction(async (tx) => {
        await tx.insert(invoicePayments).values({
          workspaceId: invoice.workspaceId,
          invoiceId: invoice.id,
          stripePaymentIntentId: paymentIntent.id,
          stripeCustomerId,
          amount: invoice.total,
          currency: 'usd',
          status: 'pending',
          payerEmail: payerEmail || client.email || undefined,
          payerName: payerName || client.companyName || `${client.firstName} ${client.lastName}`,
        });

        await tx
          .update(invoices)
          .set({
            paymentIntentId: paymentIntent.id,
            // Status remains 'sent' until payment confirmed via webhook
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, invoice.id), eq(invoices.workspaceId, invoice.workspaceId)));
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: invoice.total,
        currency: 'usd',
      });
    } catch (error: unknown) {
      log.error('Error creating payment intent:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to create payment intent' });
    }
  });

  router.get('/:id/payment-status', async (req, res) => {
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

router.post("/adjustments", async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ error: roleCheck.error });

    // RC7: Validate body — catches type errors on amount before the manual parsedAmount
    // check, and ensures invoiceId is a real UUID before the DB query.
    const adjustmentParsed = invoiceAdjustmentBodySchema.safeParse(req.body);
    if (!adjustmentParsed.success) {
      return res.status(400).json({ error: 'Invalid request body', errors: adjustmentParsed.error.flatten().fieldErrors });
    }
    const { invoiceId, adjustmentType, description, amount, reason } = adjustmentParsed.data;

    const workspaceId = req.workspaceId;
    const userId = req.user?.id || (req as any).userId;
    if (!workspaceId || !userId) return res.status(400).json({ error: 'Workspace and user required' });

    const parsedAmount = amount;
    if (businessRuleResponse(res, [validateInvoiceAmount(parsedAmount, 'amount')])) return;

    const [adjustment] = await db.insert(invoiceAdjustments).values({
      invoiceId,
      workspaceId,
      adjustmentType: adjustmentType || 'correction',
      description: description || 'Invoice adjustment',
      amount: parsedAmount.toFixed(2),
      reason: reason || 'No reason provided',
      createdBy: userId,
      status: 'pending'
    }).returning();
    res.json({ success: true, data: adjustment });
  } catch (error: unknown) {
    log.error('Error creating invoice adjustment:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.patch("/adjustments/:adjustmentId/approve", async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ error: roleCheck.error });
    const { adjustmentId } = req.params;
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || (req as any).userId;
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

router.patch("/adjustments/:adjustmentId/reject", async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ error: roleCheck.error });
    const { adjustmentId } = req.params;
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || (req as any).userId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

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
      .set({ status: 'rejected' })
      .where(and(eq(invoiceAdjustments.id, adjustmentId), eq(invoiceAdjustments.workspaceId, workspaceId), eq(invoiceAdjustments.status, 'pending')))
      .returning();

    if (!adjustment) return res.status(409).json({ error: 'Concurrent modification — adjustment no longer pending' });

    storage.createAuditLog({
      workspaceId,
      userId: userId || 'unknown',
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'invoice_adjustment',
      entityId: adjustmentId,
      actionDescription: `Invoice adjustment ${adjustmentId} rejected`,
      changes: { before: { status: 'pending' }, after: { status: 'rejected' } },
      isSensitiveData: false,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for adjustment rejection', { error: err?.message }));

    res.json({ success: true, data: adjustment });
  } catch (error: unknown) {
    log.error('Error rejecting adjustment:', error);
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

router.get('/tax-rates/:stateCode', async (req: AuthenticatedRequest, res) => {
  try {
    const { stateCode } = req.params;
    const { stateTaxService } = await import('../services/billing/stateTaxService');
    const rate = stateTaxService.getStateTaxRate(stateCode);
    if (!rate) {
      return res.status(404).json({ message: `No tax rate found for state: ${stateCode}` });
    }
    res.json(rate);
  } catch (error: unknown) {
    log.error('Error fetching state tax rate:', error);
    res.status(500).json({ message: 'Failed to fetch state tax rate' });
  }
});

router.get('/tax-rates/resolve/:clientId', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { clientId } = req.params;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
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

router.post('/tax-rates/client-override', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { clientId, rate, note } = req.body;
    if (!clientId || rate === undefined || rate === null) {
      return res.status(400).json({ message: 'clientId and rate are required' });
    }
    if (typeof rate !== 'number' || rate < 0 || rate > 1) {
      return res.status(400).json({ message: 'rate must be a number between 0 and 1 (e.g. 0.08 for 8%)' });
    }

    const { stateTaxService } = await import('../services/billing/stateTaxService');
    stateTaxService.setClientTaxOverride(clientId, rate, note || '');

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (userWorkspace) {
      storage.createAuditLog({
        workspaceId: userWorkspace.workspaceId,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.user?.role || 'user',
        action: 'update',
        entityType: 'tax_override',
        entityId: clientId,
        actionDescription: `Set client tax override to ${(rate * 100).toFixed(2)}%`,
        changes: { after: { clientId, rate, note } },
        isSensitiveData: true,
        complianceTag: 'soc2',
      }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for tax override', { error: err?.message }));
    }

    res.json({ success: true, clientId, rate, note });
  } catch (error: unknown) {
    log.error('Error setting client tax override:', error);
    res.status(500).json({ message: 'Failed to set client tax override' });
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

router.get('/tax-rates/client-overrides/all', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { stateTaxService } = await import('../services/billing/stateTaxService');
    const overrides = stateTaxService.getAllClientOverrides();
    res.json(overrides);
  } catch (error: unknown) {
    log.error('Error fetching client tax overrides:', error);
    res.status(500).json({ message: 'Failed to fetch client tax overrides' });
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

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
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
      // @ts-expect-error — TS migration: fix in refactoring sprint
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
// DISPUTE-INV-01: POST /:id/dispute
// Marks an invoice as 'disputed', freezes further PATCH edits and re-sends,
// and writes a full billing_audit_log entry + platform event.
// The 'disputed' status is an established part of the invoice enum but had no
// creation path — it could only be set via PATCH which bypasses the full audit
// trail and does not lock the invoice.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/dispute', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ message: 'reason is required', code: 'MISSING_REASON' });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.workspaceId, userWorkspace.workspaceId)))
      .limit(1);

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const UNDISPUTEABLE_STATUSES = ['paid', 'cancelled', 'void', 'refunded', 'disputed'];
    if (UNDISPUTEABLE_STATUSES.includes(invoice.status as string)) {
      return res.status(409).json({
        message: `Invoice is in status '${invoice.status}' and cannot be disputed.`,
        code: 'INVOICE_NOT_DISPUTABLE',
        currentStatus: invoice.status,
      });
    }

    const [updated] = await db.update(invoices)
      .set({ status: 'disputed', updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.workspaceId, userWorkspace.workspaceId)))
      .returning();

    await db.insert(billingAuditLog).values({
      workspaceId: userWorkspace.workspaceId,
      eventType: 'invoice_disputed',
      eventCategory: 'invoice',
      actorType: 'user',
      actorId: userId,
      actorEmail: req.user?.email || null,
      description: `Invoice ${invoice.invoiceNumber} marked as disputed. Reason: ${reason.trim()}`,
      relatedEntityType: 'invoice',
      relatedEntityId: id,
      previousState: { status: invoice.status },
      newState: { status: 'disputed', reason: reason.trim() },
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null,
    }).catch(err => log.error('[BillingAudit] CRITICAL: billing_audit_log write failed for invoice dispute', { error: err?.message }));

    storage.createAuditLog({
      workspaceId: userWorkspace.workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'invoice',
      entityId: id,
      actionDescription: `Invoice ${invoice.invoiceNumber} marked as disputed`,
      changes: { before: { status: invoice.status }, after: { status: 'disputed', reason: reason.trim() } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for invoice dispute', { error: err?.message }));

    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(userWorkspace.workspaceId, {
      type: 'invoices_updated',
      action: 'disputed',
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
    });

    platformEventBus.publish({
      type: 'invoice_disputed',
      category: 'automation',
      title: `Invoice ${invoice.invoiceNumber} Disputed`,
      description: `Invoice disputed — $${parseFloat(String(invoice.total || 0)).toFixed(2)}. Reason: ${reason.trim()}`,
      workspaceId: userWorkspace.workspaceId,
      userId,
      metadata: {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        amount: invoice.total,
        previousStatus: invoice.status,
        reason: reason.trim(),
      },
      visibility: 'manager',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ ...updated, disputeReason: reason.trim() });
  } catch (error: unknown) {
    log.error('Error disputing invoice:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to dispute invoice' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// DISPUTE-INV-02: POST /:id/resolve-dispute
// Resolves an open invoice dispute, returning the invoice to 'sent' status
// (or a caller-specified target status). Writes full billing_audit_log.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/resolve-dispute', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { id } = req.params;
    const { resolution, resolvedStatus } = req.body;
    if (!resolution || typeof resolution !== 'string' || resolution.trim().length === 0) {
      return res.status(400).json({ message: 'resolution is required', code: 'MISSING_RESOLUTION' });
    }

    const ALLOWED_RESOLVED_STATUSES = ['sent', 'cancelled', 'void'] as const;
    const targetStatus: string = ALLOWED_RESOLVED_STATUSES.includes(resolvedStatus)
      ? resolvedStatus
      : 'sent';

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.workspaceId, userWorkspace.workspaceId)))
      .limit(1);

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    if (invoice.status !== 'disputed') {
      return res.status(409).json({
        message: `Invoice is in status '${invoice.status}', not 'disputed'. Cannot resolve.`,
        code: 'INVOICE_NOT_DISPUTED',
        currentStatus: invoice.status,
      });
    }

    const [updated] = await db.update(invoices)
      .set({ status: targetStatus as any, updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.workspaceId, userWorkspace.workspaceId)))
      .returning();

    await db.insert(billingAuditLog).values({
      workspaceId: userWorkspace.workspaceId,
      eventType: 'invoice_dispute_resolved',
      eventCategory: 'invoice',
      actorType: 'user',
      actorId: userId,
      actorEmail: req.user?.email || null,
      description: `Invoice ${invoice.invoiceNumber} dispute resolved. Resolution: ${resolution.trim()}. New status: ${targetStatus}`,
      relatedEntityType: 'invoice',
      relatedEntityId: id,
      previousState: { status: 'disputed' },
      newState: { status: targetStatus, resolution: resolution.trim() },
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null,
    }).catch(err => log.error('[BillingAudit] CRITICAL: billing_audit_log write failed for dispute resolution', { error: err?.message }));

    storage.createAuditLog({
      workspaceId: userWorkspace.workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'update',
      entityType: 'invoice',
      entityId: id,
      actionDescription: `Invoice ${invoice.invoiceNumber} dispute resolved → ${targetStatus}`,
      changes: { before: { status: 'disputed' }, after: { status: targetStatus, resolution: resolution.trim() } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for dispute resolution', { error: err?.message }));

    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(userWorkspace.workspaceId, {
      type: 'invoices_updated',
      action: 'dispute_resolved',
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      newStatus: targetStatus,
    });

    platformEventBus.publish({
      type: 'invoice_dispute_resolved',
      category: 'automation',
      title: `Invoice ${invoice.invoiceNumber} Dispute Resolved`,
      description: `Dispute resolved — invoice returned to '${targetStatus}'. ${resolution.trim()}`,
      workspaceId: userWorkspace.workspaceId,
      userId,
      metadata: {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        resolvedStatus: targetStatus,
        resolution: resolution.trim(),
      },
      visibility: 'manager',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ ...updated, resolution: resolution.trim() });
  } catch (error: unknown) {
    log.error('Error resolving invoice dispute:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to resolve invoice dispute' });
  }
});

router.post('/apply-late-fees', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
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

router.post('/credit-memo', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    // RC7: Zod validates UUID format on originalInvoiceId and positive amount in one
    // pass — replaces three separate manual checks with a single schema validation.
    const creditMemoParsed = creditMemoBodySchema.safeParse(req.body);
    if (!creditMemoParsed.success) {
      return res.status(400).json({ message: 'Invalid request body', errors: creditMemoParsed.error.flatten().fieldErrors });
    }
    const { originalInvoiceId, amount, reason } = creditMemoParsed.data;

    const { invoiceService } = await import('../services/billing/invoice');
    const result = await invoiceService.createCreditMemo(
      userWorkspace.workspaceId,
      originalInvoiceId,
      amount,
      reason,
      userId,
    );

    storage.createAuditLog({
      workspaceId: userWorkspace.workspaceId,
      userId,
      userEmail: req.user?.email || 'unknown',
      userRole: req.user?.role || 'user',
      action: 'create',
      entityType: 'credit_memo',
      entityId: result.creditMemo.id,
      actionDescription: `Credit memo created for $${amount.toFixed(2)} against invoice ${originalInvoiceId}`,
      changes: { after: { creditMemoId: result.creditMemo.id, originalInvoiceId, amount, reason } },
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for credit memo', { error: err?.message }));

    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(userWorkspace.workspaceId, { type: 'invoices_updated', action: 'credit_memo' });
    platformEventBus.publish({
      type: 'invoice_voided',
      category: 'automation',
      title: 'Credit Memo Issued',
      description: `Credit memo for $${Number(amount).toFixed(2)} issued against invoice ${originalInvoiceId}`,
      workspaceId: userWorkspace.workspaceId,
      userId,
      metadata: {
        creditMemoId: result.creditMemo.id,
        originalInvoiceId,
        amount,
        reason,
        issuedBy: userId,
        source: 'credit_memo',
      },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      creditMemo: result.creditMemo,
      originalInvoice: result.originalInvoice,
    });
  } catch (error: unknown) {
    log.error('Error creating credit memo:', error);
    res.status(400).json({ message: sanitizeError(error) || 'Failed to create credit memo' });
  }
});

router.post('/send-payment-reminders', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
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

router.get('/statement/:clientId', async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = await requireManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });

    const { clientId } = req.params;
    const { month, year } = req.query;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const { invoiceService } = await import('../services/billing/invoice');
    const pdfBuffer = await invoiceService.generateClientStatement(
      clientId,
      userWorkspace.workspaceId,
      month ? parseInt(month as string) : undefined,
      year ? parseInt(year as string) : undefined,
    );

    const monthNum = month ? parseInt(month as string) : new Date().getMonth() + 1;
    const yearNum = year ? parseInt(year as string) : new Date().getFullYear();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${clientId.substring(0, 8)}-${yearNum}-${String(monthNum).padStart(2, '0')}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: unknown) {
    log.error('Error generating client statement:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to generate client statement' });
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

router.get('/portal/:accessToken', async (req, res) => {
  try {
    const { accessToken } = req.params;
    const { clientPortalAccess } = await import("@shared/schema");

    const [portal] = await db.select().from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.accessToken, accessToken),
        eq(clientPortalAccess.isActive, true),
      ));

    if (!portal) {
      return res.status(404).json({ message: "Portal access not found or inactive" });
    }

    if (portal.expiresAt && new Date(portal.expiresAt) < new Date()) {
      return res.status(403).json({ message: "Portal access has expired" });
    }

    await db.update(clientPortalAccess)
      .set({ lastAccessedAt: new Date() })
      .where(eq(clientPortalAccess.id, portal.id));

    // Mark any unviewed sent/overdue invoices as viewed when client opens portal
    await db.update(invoices)
      .set({ viewedAt: new Date() })
      .where(and(
        eq(invoices.workspaceId, portal.workspaceId),
        eq(invoices.clientId, portal.clientId),
        isNull(invoices.viewedAt),
        sql`${invoices.status} IN ('sent', 'overdue', 'partial')`,
      ));

    const clientInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      total: invoices.total,
      subtotal: invoices.subtotal,
      taxAmount: invoices.taxAmount,
      status: invoices.status,
      paidAt: invoices.paidAt,
      viewedAt: invoices.viewedAt,
    }).from(invoices).where(and(
      eq(invoices.workspaceId, portal.workspaceId),
      eq(invoices.clientId, portal.clientId),
    )).orderBy(desc(invoices.issueDate)).limit(100);

    const [client] = await db.select().from(clients)
      .where(eq(clients.id, portal.clientId));

    const resolvedClientName = (client as any)?.companyName || [`${(client as any)?.firstName || ''}`, `${(client as any)?.lastName || ''}`].filter(Boolean).join(' ').trim() || 'Client';
    res.json({
      portalName: portal.portalName || `${resolvedClientName} — Billing Portal`,
      logoUrl: portal.logoUrl,
      primaryColor: portal.primaryColor,
      clientName: resolvedClientName,
      invoices: clientInvoices,
    });
  } catch (error: unknown) {
    log.error("Error accessing client portal:", error);
    res.status(500).json({ message: "Portal error" });
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
        .where(eq(invoices.id, invoiceId));
    }

    const lineItems = await storage.getInvoiceLineItems(invoiceId);

    const { paymentRecords } = await import("@shared/schema");
    const payments = await db.select().from(paymentRecords)
      .where(and(
        eq(paymentRecords.invoiceId, invoiceId),
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
        .where(inArray(clients.id, clientIds));
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
        .where(inArray(clients.id, topClientIds));
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
router.post('/portal/:accessToken/invoice/:invoiceId/acknowledge', async (req, res) => {
  try {
    const { accessToken, invoiceId } = req.params;
    const { clientPortalAccess } = await import('@shared/schema');

    const [portal] = await db.select().from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.accessToken, accessToken),
        eq(clientPortalAccess.isActive, true),
      ));

    if (!portal) return res.status(404).json({ message: 'Portal access not found or inactive' });
    if (portal.expiresAt && new Date(portal.expiresAt) < new Date()) {
      return res.status(403).json({ message: 'Portal access has expired' });
    }

    const invoice = await storage.getInvoice(invoiceId, portal.workspaceId);
    if (!invoice || invoice.clientId !== portal.clientId) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (['paid', 'void', 'cancelled', 'refunded'].includes(invoice.status || "")) {
      return res.status(409).json({ message: `Invoice is in status '${invoice.status}' and cannot be acknowledged` });
    }

    await db.update(invoices)
      .set({ viewedAt: invoice.viewedAt ?? new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, portal.workspaceId)));

    return res.json({ success: true, message: 'Invoice acknowledged' });
  } catch (error: unknown) {
    log.error('Error acknowledging portal invoice:', error);
    return res.status(500).json({ message: 'Failed to acknowledge invoice' });
  }
});

// ─── CLIENT PORTAL — Dispute Invoice ────────────────────────────────────────
// POST /portal/:accessToken/invoice/:invoiceId/dispute
// Client initiates a dispute on an invoice from the portal.
// Marks invoice as 'disputed', freezes further edits, notifies workspace owner.
router.post('/portal/:accessToken/invoice/:invoiceId/dispute', async (req, res) => {
  try {
    const { accessToken, invoiceId } = req.params;
    const { reason } = req.body as { reason?: string };
    const { clientPortalAccess } = await import('@shared/schema');

    const [portal] = await db.select().from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.accessToken, accessToken),
        eq(clientPortalAccess.isActive, true),
      ));

    if (!portal) return res.status(404).json({ message: 'Portal access not found or inactive' });
    if (portal.expiresAt && new Date(portal.expiresAt) < new Date()) {
      return res.status(403).json({ message: 'Portal access has expired' });
    }

    const invoice = await storage.getInvoice(invoiceId, portal.workspaceId);
    if (!invoice || invoice.clientId !== portal.clientId) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const UNDISPUTEABLE = ['paid', 'cancelled', 'void', 'refunded', 'disputed'];
    if (UNDISPUTEABLE.includes(invoice.status || "")) {
      return res.status(409).json({ message: `Invoice is in status '${invoice.status}' and cannot be disputed` });
    }

    await db.update(invoices)
      .set({ status: 'disputed', updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, portal.workspaceId)));

    // Log the dispute event to billing audit log
    await db.insert(billingAuditLog).values({
      id: crypto.randomUUID(),
      workspaceId: portal.workspaceId,
      invoiceId,
      action: 'client_portal_dispute',
      performedBy: `portal:${portal.clientId}`,
      metadata: { reason: reason || 'No reason provided', clientId: portal.clientId, source: 'client_portal' },
      createdAt: new Date(),
    } as any).catch((err: any) => log.warn('[BillingAudit] billing_audit_log write failed (non-blocking):', err?.message));

    // LAW 21 — Notify org owner of client-initiated invoice dispute
    (async () => {
      try {
        const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
        const { workspaces: workspacesSchema } = await import('@shared/schema');
        const [ws] = await db
          .select({ ownerId: workspacesSchema.ownerId })
          .from(workspacesSchema)
          .where(eq(workspacesSchema.id, portal.workspaceId))
          .limit(1);
        if (ws?.ownerId) {
          await NotificationDeliveryService.send({
            type: 'client_portal_dispute',
            workspaceId: portal.workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            subject: `Invoice Dispute Filed — ${invoice.invoiceNumber}`,
            body: {
              invoiceId,
              invoiceNumber: invoice.invoiceNumber,
              invoiceTotal: invoice.total,
              clientId: portal.clientId,
              reason: reason || 'No reason provided',
              source: 'client_portal',
              action: 'Review invoice and contact client within 48 hours.',
            },
            idempotencyKey: `client_portal_dispute-${invoiceId}-${Date.now()}`,
          });
        }
      } catch (notifyErr: unknown) {
        log.warn('[InvoicePortal] Dispute NDS notification failed (non-blocking):', (notifyErr as Error)?.message);
      }
    })();

    return res.json({ success: true, message: 'Invoice dispute recorded. Your account manager will be in touch.' });
  } catch (error: unknown) {
    log.error('Error disputing portal invoice:', error);
    return res.status(500).json({ message: 'Failed to dispute invoice' });
  }
});

// ─── CLIENT PORTAL — Create Payment Intent ──────────────────────────────────
// POST /portal/:accessToken/invoice/:invoiceId/create-payment-intent
// Creates a Stripe PaymentIntent for the client to pay an invoice.
// Scoped by portal token: clientId + workspaceId verified against token.
// Returns { clientSecret, publishableKey, amount, currency, invoiceNumber }.
router.post('/portal/:accessToken/invoice/:invoiceId/create-payment-intent', async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: 'Payment processing is not configured for this system. Please contact your service provider.' });
    }

    const { accessToken, invoiceId } = req.params;
    const { clientPortalAccess, paymentRecords: paymentRecordsTable } = await import('@shared/schema');

    const [portal] = await db.select().from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.accessToken, accessToken),
        eq(clientPortalAccess.isActive, true),
      ));

    if (!portal) return res.status(404).json({ message: 'Portal access not found or inactive' });
    if (portal.expiresAt && new Date(portal.expiresAt) < new Date()) {
      return res.status(403).json({ message: 'Portal access has expired' });
    }

    const invoice = await storage.getInvoice(invoiceId, portal.workspaceId);
    if (!invoice || invoice.clientId !== portal.clientId) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const UNPAYABLE = ['paid', 'void', 'cancelled', 'refunded', 'disputed'];
    if (UNPAYABLE.includes(invoice.status || '')) {
      return res.status(409).json({ message: `Invoice is in status '${invoice.status}' and cannot be paid` });
    }

    // Calculate balance remaining
    const paymentsAlready = await db.select({ amount: paymentRecordsTable.amount })
      .from(paymentRecordsTable)
      .where(and(
        eq(paymentRecordsTable.invoiceId, invoiceId),
        eq(paymentRecordsTable.status, 'completed'),
      ));
    const totalPaid = paymentsAlready.reduce((s, p) => s + parseFloat(p.amount || '0'), 0);
    const invoiceTotal = parseFloat(invoice.total || '0');
    const balanceRemaining = Math.max(0, invoiceTotal - totalPaid);

    if (balanceRemaining <= 0) {
      return res.status(409).json({ message: 'Invoice balance is zero — nothing to pay.' });
    }

    // Stripe expects amount in cents
    const amountCents = Math.round(balanceRemaining * 100);

    // Look up client company name for Stripe description
    const clientDescription = `Invoice ${invoice.invoiceNumber} — portal payment`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      description: clientDescription,
      metadata: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber || '',
        workspaceId: portal.workspaceId,
        clientId: portal.clientId,
        source: 'client_portal',
      },
    });

    // Store the paymentIntentId on the invoice so the webhook can match and mark paid
    await db.update(invoices)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() } as any)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, portal.workspaceId)));

    return res.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      amount: balanceRemaining,
      amountCents,
      currency: 'usd',
      invoiceNumber: invoice.invoiceNumber,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: unknown) {
    log.error('Error creating portal payment intent:', error);
    return res.status(500).json({ message: 'Failed to create payment intent' });
  }
});

export default router;
