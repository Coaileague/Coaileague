import { db } from '../../db';
import { invoices, clients } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { InvoiceService } from '../billing/invoice';

const log = createLogger('FinanceInvoiceService');
const _billingInvoiceService = new InvoiceService();

export const invoiceService = {
  async sendInvoice(invoiceId: string, workspaceId: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const [invoice] = await db.select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
        .limit(1);

      if (!invoice) {
        return { success: false, message: 'Invoice not found or access denied' };
      }

      // Only draft invoices are sendable. Already-sent/paid/voided invoices
      // must not be re-dispatched (duplicate client emails, audit drift).
      if (invoice.status !== 'draft') {
        return {
          success: false,
          message: `Invoice ${invoice.invoiceNumber ?? invoiceId} cannot be sent from status '${invoice.status}'. Only drafts can be sent.`,
        };
      }

      // Atomically workspace-scoped FK lookup (CLAUDE.md §G).
      const [client] = await db.select()
        .from(clients)
        .where(and(eq(clients.id, invoice.clientId), eq(clients.workspaceId, workspaceId)))
        .limit(1);

      if (!client?.email) {
        return { success: false, message: 'Client email not found for invoice delivery' };
      }

      const result = await _billingInvoiceService.sendInvoiceEmail(invoiceId, client.email);
      if (result.success) {
        return { success: true, message: `Invoice ${invoice.invoiceNumber} sent to ${client.email}`, data: { invoiceId, recipientEmail: client.email } };
      }
      return { success: false, message: result.error || 'Failed to send invoice' };
    } catch (err: any) {
      log.error('sendInvoice failed', { invoiceId, workspaceId, error: err?.message });
      return { success: false, message: err?.message || 'Invoice send failed' };
    }
  },

  async getInvoice(invoiceId: string, workspaceId: string) {
    const [invoice] = await db.select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
      .limit(1);
    return invoice || null;
  },
};
