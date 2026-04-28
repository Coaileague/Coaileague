import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { eq, and, ne } from 'drizzle-orm';
import { payStubs, plaidTransferAttempts } from '@shared/schema';
import { getTransferStatus, verifyPlaidWebhookJwt } from '../services/partners/plaidService';
import { platformEventBus } from '../services/platformEventBus';
import { broadcastToWorkspace } from '../websocket';
import { createLogger } from '../lib/logger';
import { tryClaimWebhookEvent } from '../services/infrastructure/webhookIdempotency';
import { z } from 'zod';
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
  // G-P1-4 FIX: Verify Plaid JWT signature BEFORE acknowledging.
  // Previous pattern returned 200 first, meaning Plaid saw success even when
  // verification failed — causing legitimate events to be silently dropped.
  // Now: verify → 200 on success, 400 on failure (triggers Plaid retry).
  // Processing errors after verification still return 200 to avoid retry storms.
  const plaidVerificationToken = req.headers['plaid-verification'] as string | undefined;

  if (!process.env.PLAID_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
    log.error('[PlaidWebhook] CRITICAL: PLAID_WEBHOOK_SECRET not configured in production — returning 500');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  const isValidSignature = await verifyPlaidWebhookJwt(plaidVerificationToken);
  if (!isValidSignature) {
    log.error('[PlaidWebhook] Signature verification failed — rejecting with 400 so Plaid retries');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Signature verified — acknowledge so Plaid stops retrying, then process
  res.status(200).json({ received: true });

  const body = req.body || {};
    const { webhook_type, webhook_code, transfer_id, event_type } = body;

    try {
      const eventKey = transfer_id
        ? `${transfer_id}:${event_type || webhook_code || 'unknown'}`
        : (webhook_code || event_type || 'unknown');
      const claimed = await tryClaimWebhookEvent('plaid', eventKey, webhook_code || event_type);
      if (!claimed) {
        log.info(`[PlaidWebhook] Duplicate webhook skipped: ${eventKey}`);
        return;
      }

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
