import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { eq, and, ne } from 'drizzle-orm';
import { payStubs, plaidTransferAttempts } from '@shared/schema';
import { getTransferStatus, verifyPlaidWebhookJwt } from '../services/partners/plaidService';
import { platformEventBus } from '../services/platformEventBus';
import { broadcastToWorkspace } from '../websocket';
import { createLogger } from '../lib/logger';
const log = createLogger('PlaidWebhookRoutes');


const router = Router();

/**
 * POST /api/plaid/webhook
 * Receives real-time transfer status pushes from Plaid.
 * This route is registered WITHOUT auth middleware — Plaid calls it as a server-to-server webhook.
 * Always responds 200 to prevent Plaid from retrying on application-level errors.
 *
 * Plaid Transfer webhook shape:
 *   { webhook_type: 'TRANSFER', webhook_code: 'TRANSFER_EVENTS_UPDATE', transfer_id?, event_type? }
 *
 * IDEMPOTENCY: Plaid delivers webhooks at-least-once. The DB update uses
 * `AND plaidTransferStatus != newStatus` so it only returns rows whose status
 * actually changed. Events (settled/failed) are only published for rows that
 * changed — preventing duplicate SMS notifications and platform events on
 * re-delivery of the same webhook.
 */
router.post('/', async (req, res) => {
  res.status(200).json({ received: true }); // Respond immediately to prevent Plaid timeout

  // GAP-35 FIX: Verify Plaid JWT webhook signature BEFORE processing.
  // Plaid signs all webhooks with RSA-signed JWTs sent in the `Plaid-Verification` header.
  // Without this guard, any external server can POST a forged "settled" event with a real
  // transfer_id to fabricate ledger entries and trigger payroll disbursed notifications.
  // Verification is async (after the 200 response) so it does not add latency to Plaid's retry logic.
  const plaidVerificationToken = req.headers['plaid-verification'] as string | undefined;
  
  // OMEGA DIRECTIVE: PLAID_WEBHOOK_SECRET must be verified on every inbound webhook.
  if (!process.env.PLAID_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
    log.error('[PlaidWebhook] CRITICAL: PLAID_WEBHOOK_SECRET not configured in production. Webhook verification skipped but this is a security violation.');
  }

  const isValidSignature = await verifyPlaidWebhookJwt(plaidVerificationToken);
  if (!isValidSignature) {
    log.error('[PlaidWebhook] Signature verification failed — request rejected. Transfer will not be processed.');
    return;
  }

  const body = req.body || {};
  const { webhook_type, webhook_code, transfer_id, event_type } = body;

  try {
    platformEventBus.publish({
      type: 'plaid_webhook_received',
      category: 'integration',
      title: `Plaid Webhook: ${webhook_type || 'UNKNOWN'}/${webhook_code || 'UNKNOWN'}`,
      description: `Plaid pushed ${webhook_type} webhook — code: ${webhook_code}${transfer_id ? `, transfer: ${transfer_id}` : ''}`,
      metadata: { webhookType: webhook_type, webhookCode: webhook_code, transferId: transfer_id, eventType: event_type },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    if (webhook_type !== 'TRANSFER' || !transfer_id) return;

    let status = event_type as string;
    let failureReason: string | undefined;

    try {
      const result = await getTransferStatus(transfer_id);
      status = result.status;
      failureReason = result.failureReason;
    } catch {
      status = event_type || 'unknown';
    }

    // GAP-1 FIX: Idempotency guard — only update rows whose status has actually changed.
    // Plaid delivers webhooks at-least-once; a duplicate webhook for an already-settled
    // transfer would previously fire a second payroll_transfer_settled platform event,
    // sending duplicate SMS notifications to employees. The `ne(plaidTransferStatus, status)`
    // condition makes the UPDATE a no-op for unchanged rows, so the RETURNING set is empty
    // and no downstream events fire.
    const updated = await db
      .update(payStubs)
      .set({
        plaidTransferStatus: status,
        plaidTransferFailureReason: failureReason || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(payStubs.plaidTransferId, transfer_id),
        ne(payStubs.plaidTransferStatus, status),  // only rows whose status changed
      ))
      .returning({
        id: payStubs.id,
        workspaceId: payStubs.workspaceId,
        employeeId: payStubs.employeeId,
        netPay: payStubs.netPay,
        payrollRunId: payStubs.payrollRunId,
      });

    // Close the compensating-transaction lifecycle in plaid_transfer_attempts
    // so reconciliation queries can filter on terminal states. A 'settled'
    // webhook marks the attempt 'completed'. Failed/returned attempts stay
    // 'initiated' so the daily orphan-scanner can surface them for review.
    if (status === 'settled') {
      try {
        await db.update(plaidTransferAttempts).set({
          status: 'completed',
          completedAt: new Date(),
        } as any).where(and(
          eq(plaidTransferAttempts.transferId, transfer_id),
          ne(plaidTransferAttempts.status, 'completed'),
        ));
      } catch (attemptErr: any) {
        log.warn('[PlaidWebhook] plaid_transfer_attempts completion update failed (non-fatal):', attemptErr?.message);
      }
    }

    // GAP-2 FIX: Log a warning when no stubs match the transfer_id.
    // This indicates either the transfer was initiated outside of CoAIleague or the
    // pay stub record was cleaned up. In production this warrants admin investigation.
    if (updated.length === 0) {
      log.warn(`[PlaidWebhook] No pay stubs matched transfer_id=${transfer_id} with status change to '${status}'. Either already processed (idempotent) or orphaned transfer.`);
      return;
    }

    for (const stub of updated) {
      broadcastToWorkspace(stub.workspaceId, {
        type: 'plaid_transfer_updated',
        payStubId: stub.id,
        payrollRunId: stub.payrollRunId,
        employeeId: stub.employeeId,
        transferId: transfer_id,
        status,
        failureReason: failureReason || null,
        source: 'webhook',
      });

      if (status === 'settled') {
        platformEventBus.publish({
          type: 'payroll_transfer_settled',
          category: 'integration',
          title: 'Payroll ACH Transfer Settled',
          description: `ACH transfer settled for employee ${stub.employeeId} — $${stub.netPay} delivered`,
          workspaceId: stub.workspaceId,
          metadata: {
            payStubId: stub.id,
            payrollRunId: stub.payrollRunId,
            employeeId: stub.employeeId,
            transferId: transfer_id,
            amount: stub.netPay,
            source: 'webhook',
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      } else if (status === 'failed' || status === 'returned') {
        platformEventBus.publish({
          type: 'payroll_transfer_failed',
          category: 'integration',
          title: 'Payroll ACH Transfer Failed',
          description: `ACH transfer ${status} for employee ${stub.employeeId}: ${failureReason || 'No reason provided'}`,
          workspaceId: stub.workspaceId,
          metadata: {
            payStubId: stub.id,
            payrollRunId: stub.payrollRunId,
            employeeId: stub.employeeId,
            transferId: transfer_id,
            status,
            failureReason,
            source: 'webhook',
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }
  } catch (err: unknown) {
    log.error('[PlaidWebhook] Processing error (non-fatal, response already sent):', sanitizeError(err));
  }
});

export default router;
