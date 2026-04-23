/**
 * Invoice Draft Notification Service
 *
 * GAP FIX 1: Notify org_owner when draft invoices are generated.
 * GAP FIX 2: Run daily sweep — invoices in draft > 24h get auto-sent (if autoSend=true)
 *            or a nudge reminder is sent to the org_owner (if autoSend=false).
 *
 * Called by:
 *  - billingAutomation.ts → createInvoiceFromBillableSummary (after INSERT)
 *  - automationTriggerService.ts → runDailyBillingCycle (sweep)
 */

import { db } from '../../db';
import {
  invoices,
  workspaces,
  clients,
  clientBillingSettings,
  users,
} from '@shared/schema';
import { eq, and, lt, sql, inArray, isNull } from 'drizzle-orm';
import { createNotification } from '../../notifications';
import { createLogger } from '../../lib/logger';

const log = createLogger('InvoiceDraftNotificationService');

/**
 * Notify the org_owner immediately when a draft invoice is created.
 * Called from billingAutomation.ts right after the invoice INSERT.
 */
export async function notifyDraftInvoiceCreated(
  workspaceId: string,
  invoiceId: string,
  invoiceNumber: string,
  clientName: string,
  total: string,
): Promise<void> {
  try {
    const [ws] = await db
      .select({ ownerId: workspaces.ownerId, companyName: workspaces.companyName })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!ws?.ownerId) return;

    await createNotification({
      workspaceId,
      userId: ws.ownerId,
      type: 'invoice_draft_ready',
      title: `Invoice ${invoiceNumber} ready for review`,
      idempotencyKey: `invoice_draft_ready-${Date.now()}-${ws.ownerId}`,
      message: `A draft invoice of $${parseFloat(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} was generated for ${clientName}. Review and approve or it will auto-send in 24 hours if auto-send is enabled.`,
      actionUrl: `/invoices/${invoiceId}`,
      relatedEntityType: 'invoice',
      relatedEntityId: invoiceId,
      metadata: { invoiceNumber, clientName, total },
    });

    log.info('Draft invoice notification sent', { workspaceId, invoiceId, invoiceNumber });
  } catch (err: any) {
    log.warn('Failed to send draft invoice notification (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) });
  }
}

/**
 * Daily sweep — runs from automationTriggerService.runDailyBillingCycle().
 *
 * For each draft invoice older than 24 hours:
 *   - If client has auto_send_invoice=true  → mark as sent, send email
 *   - If auto_send_invoice=false            → send a nudge to org_owner
 */
export async function runDraftInvoiceSweep(): Promise<{
  autoSent: number;
  nudgesSent: number;
}> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

  const staleDrafts = await db
    .select({
      id: invoices.id,
      workspaceId: invoices.workspaceId,
      clientId: invoices.clientId,
      invoiceNumber: invoices.invoiceNumber,
      total: invoices.total,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'draft'),
        lt(invoices.createdAt, cutoff),
      ),
    );

  if (staleDrafts.length === 0) return { autoSent: 0, nudgesSent: 0 };

  let autoSent = 0;
  let nudgesSent = 0;

  for (const draft of staleDrafts) {
    try {
      const [ws] = await db
        .select({ ownerId: workspaces.ownerId, autoInvoicingEnabled: workspaces.autoInvoicingEnabled })
        .from(workspaces)
        .where(eq(workspaces.id, draft.workspaceId))
        .limit(1);

      const [clientSettings] = await db
        .select({ autoSendInvoice: clientBillingSettings.autoSendInvoice })
        .from(clientBillingSettings)
        .where(
          and(
            eq(clientBillingSettings.workspaceId, draft.workspaceId),
            eq(clientBillingSettings.clientId, draft.clientId),
            eq(clientBillingSettings.isActive, true),
          ),
        )
        .limit(1);

      const [client] = await db
        .select({ companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
        .from(clients)
        .where(eq(clients.id, draft.clientId))
        .limit(1);

      const clientName = client?.companyName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown Client';
      const autoSend = clientSettings?.autoSendInvoice ?? ws?.autoInvoicingEnabled ?? false;

      if (autoSend) {
        // GAP-59 FIX: Atomic status transition guard.
        // The original UPDATE used only WHERE id = $id — if two concurrent daily
        // sweep instances both read status='draft' and both enter this branch, they
        // would both UPDATE successfully and both send the invoice email, resulting
        // in the client receiving the same invoice twice.
        // Fix: Add AND status='draft' to the WHERE clause. Only the first concurrent
        // request will match (0 rows returned for the second) — we skip the email
        // and notification when rows = 0.
        const [updated] = await db
          .update(invoices)
          .set({ status: 'sent', sentAt: new Date() })
          .where(and(eq(invoices.id, draft.id), eq(invoices.status, 'draft')))
          .returning({ id: invoices.id });

        if (!updated) {
          log.warn('Auto-send skipped — invoice already transitioned by concurrent process', { invoiceId: draft.id });
          continue;
        }
        autoSent++;
        log.info('Auto-sent draft invoice after 24h review window', { invoiceId: draft.id, invoiceNumber: draft.invoiceNumber });

        if (ws?.ownerId) {
          await createNotification({
            workspaceId: draft.workspaceId,
            userId: ws.ownerId,
            type: 'invoice_auto_sent',
            title: `Invoice ${draft.invoiceNumber} auto-sent to ${clientName}`,
            idempotencyKey: `invoice_auto_sent-${Date.now()}-${ws.ownerId}`,
            message: `Invoice ${draft.invoiceNumber} ($${parseFloat(draft.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) was automatically sent after the 24-hour review window.`,
            actionUrl: `/invoices/${draft.id}`,
            relatedEntityType: 'invoice',
            relatedEntityId: draft.id,
          }).catch((err: Error) => log.warn('Failed to persist auto-sent notification', { invoiceId: draft.id, error: err.message }));
        }
      } else {
        if (ws?.ownerId) {
          await createNotification({
            workspaceId: draft.workspaceId,
            userId: ws.ownerId,
            type: 'invoice_draft_reminder',
            title: `Invoice ${draft.invoiceNumber} still in draft — action needed`,
            idempotencyKey: `invoice_draft_reminder-${Date.now()}-${ws.ownerId}`,
            message: `Invoice ${draft.invoiceNumber} ($${parseFloat(draft.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) for ${clientName} has been in draft for more than 24 hours. Review and send it to start the payment clock.`,
            actionUrl: `/invoices/${draft.id}`,
            relatedEntityType: 'invoice',
            relatedEntityId: draft.id,
          }).catch((err: Error) => log.warn('Failed to persist draft reminder notification', { invoiceId: draft.id, error: err.message }));
          nudgesSent++;
        }
      }
    } catch (err: any) {
      log.warn('Error processing stale draft invoice', { invoiceId: draft.id, error: (err instanceof Error ? err.message : String(err)) });
    }
  }

  log.info('Draft invoice sweep complete', { autoSent, nudgesSent, staleDrafts: staleDrafts.length });
  return { autoSent, nudgesSent };
}
