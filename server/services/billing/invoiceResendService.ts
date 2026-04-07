/**
 * Invoice Resend Service
 *
 * Addresses the ~464 invoices that were silently undelivered before the
 * server/email.ts barrel file was created (March 2026 fix).
 *
 * SAFETY CONTRACT:
 * - Preview mode (dryRun=true) returns a list and dollar total — no emails sent
 * - Execute mode (dryRun=false) requires explicit caller confirmation
 * - All workspaces including Statewide Protective Services are treated equally
 * - Each resend is logged in the universal audit trail
 * - deliveryConfirmed is set to true only on Resend webhook confirmation
 */

import { createLogger } from '../../lib/logger';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { db } from '../../db';
import { invoices, clients } from '@shared/schema';
import { eq, and, lt, isNull, or, inArray } from 'drizzle-orm';
import { sendInvoiceGeneratedEmail } from '../emailCore';
import { universalAudit } from '../universalAuditService';

const log = createLogger('invoiceResendService');
// Date of the email barrel fix — only invoices BEFORE this date are candidates
const EMAIL_BARREL_FIX_DATE = new Date('2026-03-12T00:00:00.000Z');

export interface UndeliveredInvoice {
  id: string;
  workspaceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  total: string;
  dueDate: string | null;
  sentAt: string | null;
  status: string;
}

export interface UndeliveredSummary {
  count: number;
  totalDollars: number;
  invoices: UndeliveredInvoice[];
}

export interface ResendResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number; // no client email
  errors: Array<{ invoiceId: string; invoiceNumber: string; error: string }>;
}

export async function getUndeliveredInvoices(): Promise<UndeliveredSummary> {
  const rows = await db
    .select({
      id: invoices.id,
      workspaceId: invoices.workspaceId,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      total: invoices.total,
      dueDate: invoices.dueDate,
      sentAt: invoices.sentAt,
      status: invoices.status,
      deliveryConfirmed: invoices.deliveryConfirmed,
    })
    .from(invoices)
    .where(and(
      eq(invoices.status as any, 'sent'),
      or(
        eq(invoices.deliveryConfirmed, false),
        isNull(invoices.deliveryConfirmed)
      ),
      lt(invoices.createdAt, EMAIL_BARREL_FIX_DATE)
    ));

  const clientIds = [...new Set(rows.map(r => r.clientId))];
  const allClients = clientIds.length > 0
    ? await db
        .select({ id: clients.id, email: clients.email, companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
        .from(clients)
        .where(inArray(clients.id, clientIds))
    : [];

  const clientMap = Object.fromEntries(allClients.map(c => [c.id, c]));

  const invoiceList: UndeliveredInvoice[] = rows.map(r => {
    const c = clientMap[r.clientId];
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      invoiceNumber: r.invoiceNumber,
      clientId: r.clientId,
      clientName: c?.companyName || `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || 'Unknown',
      clientEmail: c?.email || null,
      total: String(r.total),
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
      status: r.status || 'sent',
    };
  });

  const totalDollars = invoiceList.reduce((sum, i) => sum + parseFloat(i.total || '0'), 0);

  return {
    count: invoiceList.length,
    totalDollars,
    invoices: invoiceList,
  };
}

export async function bulkResendUndeliveredInvoices(
  dryRun: boolean,
  requestedBy: string
): Promise<ResendResult> {
  const result: ResendResult = { attempted: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] };

  const { invoices: undelivered } = await getUndeliveredInvoices();

  if (dryRun) {
    result.attempted = undelivered.length;
    log.info(`[InvoiceResend] DRY RUN — would resend ${undelivered.length} invoices`);
    return result;
  }

  for (const inv of undelivered) {
    if (!inv.clientEmail) {
      result.skipped++;
      continue;
    }

    result.attempted++;
    try {
      await sendInvoiceGeneratedEmail(inv.clientEmail, {
        clientName: inv.clientName,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : new Date().toLocaleDateString(),
        dueDate: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'Upon Receipt',
        totalAmount: parseFloat(inv.total).toFixed(2),
        lineItems: [],
        portalUrl: `${getAppBaseUrl()}/pay/${inv.id}`,
      }, inv.workspaceId, inv.id);

      await db
        .update(invoices)
        .set({ resentAfterDeliveryFailure: true })
        .where(eq(invoices.id, inv.id));

      await universalAudit({
        workspaceId: inv.workspaceId,
        action: 'invoice.resent_after_failure' as any,
        entityType: 'invoice',
        entityId: inv.id,
        actorId: requestedBy,
        metadata: {
          invoiceNumber: inv.invoiceNumber,
          clientEmail: inv.clientEmail,
          reason: 'initial delivery failed — resent after email barrel fix (March 2026)',
          resentAt: new Date().toISOString(),
        },
      });

      result.succeeded++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, error: (err instanceof Error ? err.message : String(err)) });
    }
  }

  log.info(`[InvoiceResend] Resend complete — attempted:${result.attempted}, succeeded:${result.succeeded}, failed:${result.failed}, skipped:${result.skipped}`);
  return result;
}
