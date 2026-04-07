/**
 * TRINITY INVOICE & EMAIL ACTIONS
 * ===============================
 * Last-mile financial operations and automated email orchestration.
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { invoices, clients, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { 
  sendInvoiceWithEmail, 
  sendInvoice, 
  checkOverdueInvoices, 
  generateInvoicePdfBuffer,
  markInvoicePaid,
  getRevenueForecast
} from '../../services/timesheetInvoiceService';
import { runTrinityEmailOrchestration } from '../../services/trinityEmailOrchestration';
import { sendCanSpamCompliantEmail } from '../emailCore';
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
const log = createLogger('trinityInvoiceEmailActions');

// Helper: result factory
function createResult(actionId: string, success: boolean, message: string, data?: any, startTime?: number): ActionResult {
  return {
    success,
    actionId,
    message,
    data,
    executionTimeMs: startTime ? Date.now() - startTime : 0,
  };
}

export function registerInvoiceEmailActions() {
  log.info('[Trinity Invoice+Email] Registering actions...');

  // ─── INVOICE ACTIONS ───────────────────────────────────────────────────────

  const sendInvoiceEmail: ActionHandler = {
    actionId: 'billing.invoice_send',
    name: 'Send Invoice',
    category: 'billing',
    description: 'Send invoice(s) via email. Pass payload.bulk=true with payload.invoiceIds[] for bulk send. Pass payload.method="mark_only" to mark sent without email. Otherwise sends single invoice email with PDF attachment.',
    requiredRoles: ['owner', 'manager', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = request.workspaceId!;

      // Bulk send: payload.bulk=true with invoiceIds array
      if (request.payload?.bulk === true) {
        const { invoiceIds } = request.payload || {};
        if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
          return createResult(request.actionId, false, 'Array of invoice IDs is required for bulk send', null, start);
        }
        const results = [];
        let sent = 0;
        let failed = 0;
        for (const invoiceId of invoiceIds) {
          try {
            await sendInvoiceWithEmail({ invoiceId, workspaceId, userId: request.userId });
            results.push({ invoiceId, success: true });
            sent++;
          } catch (error: any) {
            results.push({ invoiceId, success: false, error: (error instanceof Error ? error.message : String(error)) });
            failed++;
          }
        }
        return createResult(request.actionId, true, `Bulk send complete: ${sent} sent, ${failed} failed`, {
          sent, failed, details: results
        }, start);
      }

      // Mark only: payload.method="mark_only" — update status to sent without emailing
      if (request.payload?.method === 'mark_only') {
        const { invoiceId } = request.payload || {};
        if (!invoiceId) return createResult(request.actionId, false, 'Invoice ID is required', null, start);
        try {
          const result = await sendInvoice(invoiceId, workspaceId);
          return createResult(request.actionId, true, result.message, {
            success: true, invoiceId, status: 'sent'
          }, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      }

      // Default: single invoice email send
      const { invoiceId, customMessage } = request.payload || {};
      if (!invoiceId) return createResult(request.actionId, false, 'Invoice ID is required', null, start);

      try {
        const invoice = await db.query.invoices.findFirst({
          where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)),
          with: { client: true }
        });

        if (!invoice) return createResult(request.actionId, false, 'Invoice not found', { invoiceId }, start);
        if (!invoice.client?.email) return createResult(request.actionId, false, 'Client email missing', { invoiceId }, start);

        const result = await sendInvoiceWithEmail({
          invoiceId, workspaceId, userId: request.userId, customMessage
        });

        return createResult(request.actionId, true, result.message, {
          sent: true,
          invoiceId,
          clientEmail: invoice.client.email,
          clientName: invoice.client.companyName || `${invoice.client.firstName} ${invoice.client.lastName}`,
          totalAmount: invoice.total,
          pdfAttached: true,
          timestamp: new Date().toISOString()
        }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, `Failed to send invoice email: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    }
  };

  const sendBulkInvoices: ActionHandler = {
    actionId: 'billing.send_invoice_bulk',
    name: 'Send Bulk Invoices',
    category: 'billing',
    description: 'Send multiple invoices via email in a single request',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { invoiceIds } = request.payload || {};
      const workspaceId = request.workspaceId!;

      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return createResult(request.actionId, false, 'Array of invoice IDs is required', null, start);
      }

      const results = [];
      let sent = 0;
      let failed = 0;

      for (const invoiceId of invoiceIds) {
        try {
          await sendInvoiceWithEmail({
            invoiceId,
            workspaceId,
            userId: request.userId
          });
          results.push({ invoiceId, success: true });
          sent++;
        } catch (error: any) {
          results.push({ invoiceId, success: false, error: (error instanceof Error ? error.message : String(error)) });
          failed++;
        }
      }

      return createResult(request.actionId, true, `Bulk send complete: ${sent} sent, ${failed} failed`, {
        sent,
        failed,
        details: results
      }, start);
    }
  };

  const markInvoiceSent: ActionHandler = {
    actionId: 'billing.mark_invoice_sent',
    name: 'Mark Invoice as Sent',
    category: 'billing',
    description: 'Update invoice status to "sent" without actually sending an email',
    requiredRoles: ['owner', 'manager', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { invoiceId } = request.payload || {};
      const workspaceId = request.workspaceId!;

      if (!invoiceId) return createResult(request.actionId, false, 'Invoice ID is required', null, start);

      try {
        const result = await sendInvoice(invoiceId, workspaceId);
        return createResult(request.actionId, true, result.message, {
          success: true,
          invoiceId,
          status: 'sent'
        }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    }
  };

  const checkOverdue: ActionHandler = {
    actionId: 'billing.check_invoices_overdue',
    name: 'Check Overdue Invoices',
    category: 'billing',
    description: 'Identify invoices that are past their due date',
    requiredRoles: ['owner', 'manager', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = request.workspaceId!;

      try {
        const result = await checkOverdueInvoices(workspaceId);
        
        // Enhance with totals
        const overdueCount = result.length;
        const totalOverdueAmount = result.reduce((sum: number, inv: any) => sum + Number(inv.total), 0);

        return createResult(request.actionId, true, `Found ${overdueCount} overdue invoices`, {
          overdueCount,
          totalOverdueAmount,
          clients: result
        }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    }
  };

  const generatePdf: ActionHandler = {
    actionId: 'billing.invoice_pdf',
    name: 'Generate Invoice PDF',
    category: 'billing',
    description: 'Generate a PDF buffer for an invoice',
    requiredRoles: ['owner', 'manager', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { invoiceId } = request.payload || {};
      const workspaceId = request.workspaceId!;

      if (!invoiceId) return createResult(request.actionId, false, 'Invoice ID is required', null, start);

      try {
        const invoice = await db.query.invoices.findFirst({
          where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)),
          with: { client: true }
        });

        if (!invoice) return createResult(request.actionId, false, 'Invoice not found', null, start);

        const workspace = await db.query.workspaces.findFirst({
          where: eq(workspaces.id, workspaceId)
        });

        const lineItems = await db.query.invoiceLineItems.findMany({
          where: eq(invoices.id, invoiceId)
        });

        const pdfBuffer = await generateInvoicePdfBuffer({
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate || new Date(),
          dueDate: invoice.dueDate || new Date(),
          clientName: `${invoice.client?.firstName || ''} ${invoice.client?.lastName || ''}`.trim() || 'Client',
          clientCompany: invoice.client?.companyName || '',
          clientEmail: invoice.client?.email || '',
          clientAddress: invoice.client?.address || undefined,
          workspaceName: workspace?.name || PLATFORM.name,
          workspaceAddress: workspace?.address || undefined,
          lineItems: lineItems.map(li => ({
            description: li.description,
            quantity: Number(li.quantity),
            rate: Number(li.unitPrice),
            amount: Number(li.amount)
          })),
          subtotal: Number(invoice.subtotal),
          taxRate: Number(invoice.taxRate || 0),
          taxAmount: Number(invoice.taxAmount || 0),
          total: Number(invoice.total),
          notes: invoice.notes || undefined
        });

        return createResult(request.actionId, true, 'Invoice PDF generated successfully', {
          success: true,
          invoiceId,
          sizeBytes: pdfBuffer.length,
          message: 'PDF buffer generated and logged'
        }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    }
  };

  const markPaid: ActionHandler = {
    actionId: 'billing.invoice_status',
    name: 'Update Invoice Status',
    category: 'billing',
    description: 'Update invoice status. Use payload.status: "paid" to mark paid (with optional paidAmount/paymentMethod), "sent" to mark as sent without email, "overdue_scan" to check all overdue invoices. Defaults to "paid" if invoiceId provided.',
    requiredRoles: ['owner', 'manager', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = request.workspaceId!;
      const statusAction = request.payload?.status;

      // status=sent → mark invoice as sent without emailing
      if (statusAction === 'sent') {
        const { invoiceId } = request.payload || {};
        if (!invoiceId) return createResult(request.actionId, false, 'Invoice ID is required', null, start);
        try {
          const result = await sendInvoice(invoiceId, workspaceId);
          return createResult(request.actionId, true, result.message, {
            success: true, invoiceId, status: 'sent'
          }, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      }

      // status=overdue_scan → scan all overdue invoices
      if (statusAction === 'overdue_scan') {
        try {
          const result = await checkOverdueInvoices(workspaceId);
          const overdueCount = result.length;
          const totalOverdueAmount = result.reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
          return createResult(request.actionId, true, `Found ${overdueCount} overdue invoices`, {
            overdueCount, totalOverdueAmount, clients: result
          }, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      }

      // Default: status=paid (or no status with invoiceId — backward compat)
      const { invoiceId, paidAmount, paymentMethod } = request.payload || {};
      if (!invoiceId) return createResult(request.actionId, false, 'Invoice ID is required', null, start);

      try {
        const result = await markInvoicePaid(invoiceId, workspaceId, paidAmount);
        return createResult(request.actionId, true, `Invoice ${invoiceId} marked as paid`, {
          success: true,
          invoice: result.invoice,
          paymentMethod
        }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    }
  };

  // ─── EMAIL ACTIONS ─────────────────────────────────────────────────────────

  const runEmailOrchestration: ActionHandler = {
    actionId: 'email.run_orchestration',
    name: 'Run Email Orchestration',
    category: 'system',
    description: 'Run the autonomous email processing engine for the workspace',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const workspaceId = request.workspaceId!;

      try {
        const result = await runTrinityEmailOrchestration(workspaceId);
        const processed = 'processed' in result ? result.processed : 1;
        
        return createResult(request.actionId, true, `Email orchestration complete: ${processed} emails processed`, result, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    }
  };

  const sendSingleEmail: ActionHandler = {
    actionId: 'email.send_single',
    name: 'Send Single Email',
    category: 'communication',
    description: 'Send a one-off email using the platform email service',
    requiredRoles: ['owner', 'manager', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { to, subject, body, type } = request.payload || {};
      const workspaceId = request.workspaceId!;

      if (!to || !subject || !body) {
        return createResult(request.actionId, false, 'Recipients, subject, and body are required', null, start);
      }

      try {
        const result = await sendCanSpamCompliantEmail({
          to,
          subject,
          html: body,
          emailType: type || 'notification',
          workspaceId
        });

        return createResult(request.actionId, result.success, result.success ? 'Email sent' : 'Failed to send email', {
          sent: result.success,
          messageId: (result.data as any)?.data?.id
        }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    }
  };

  const sendBroadcast: ActionHandler = {
    actionId: 'email.send_broadcast',
    name: 'Send Broadcast Email',
    category: 'communication',
    description: 'Send an email to multiple recipients',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { recipients, subject, body } = request.payload || {};
      const workspaceId = request.workspaceId!;

      if (!Array.isArray(recipients) || recipients.length === 0 || !subject || !body) {
        return createResult(request.actionId, false, 'Recipients array, subject, and body are required', null, start);
      }

      let sent = 0;
      let failed = 0;

      for (const to of recipients) {
        try {
          const result = await sendCanSpamCompliantEmail({
            to,
            subject,
            html: body,
            emailType: 'broadcast',
            workspaceId
          });
          if (result.success) sent++;
          else failed++;
        } catch {
          failed++;
        }
      }

      return createResult(request.actionId, true, `Broadcast complete: ${sent} sent, ${failed} failed`, {
        sent,
        failed
      }, start);
    }
  };

  // Register all actions
  helpaiOrchestrator.registerAction(sendInvoiceEmail); // billing.invoice_send (consolidated — replaces send_invoice_email + send_invoice_bulk + mark_invoice_sent)
  // Consolidated into billing.invoice_send above — not registering separately:
  // helpaiOrchestrator.registerAction(sendBulkInvoices);
  // helpaiOrchestrator.registerAction(markInvoiceSent);
  // Consolidated into billing.invoice_status (checkOverdue) — not registering separately:
  // helpaiOrchestrator.registerAction(checkOverdue);
  helpaiOrchestrator.registerAction(generatePdf); // billing.invoice_pdf
  helpaiOrchestrator.registerAction(markPaid); // billing.invoice_status (consolidated — replaces mark_invoice_paid + mark_invoice_sent + check_invoices_overdue)
  helpaiOrchestrator.registerAction(runEmailOrchestration);
  helpaiOrchestrator.registerAction(sendSingleEmail);
  helpaiOrchestrator.registerAction(sendBroadcast);

  log.info(`[Trinity Invoice+Email] Registered 6 actions (3 consolidated, 3 email)`);
}
