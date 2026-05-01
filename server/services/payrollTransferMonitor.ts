import { db } from '../db';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import { payStubs, users, employees } from '@shared/schema';
import { getTransferStatus } from './partners/plaidService';
import { platformEventBus } from './platformEventBus';
import { broadcastToWorkspace } from '../websocket';
import { createNotification } from './notificationService';
import { sendEmail } from '../email'; // infra
import { createLogger } from '../lib/logger';
const log = createLogger('payrollTransferMonitor');


const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TERMINAL_STATUSES = new Set(['settled', 'failed', 'cancelled', 'returned']);

// G19 FIX: Track consecutive poll failures per transferId in memory.
// After MAX_CONSECUTIVE_FAILURES failures, mark the pay stub poll_failed
// and alert the org owner via in-app notification + email.
// Counter resets when a successful poll occurs.
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const consecutiveFailures = new Map<string, number>(); // transferId → failure count

let pollTimer: NodeJS.Timeout | null = null;
let isPolling = false; // G20 FIX: Prevents setInterval overlap if a cycle takes > POLL_INTERVAL_MS

async function getOrgOwnerForWorkspace(workspaceId: string): Promise<{ userId: string; email: string } | null> {
  try {
    const [ownerEmp] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.workspaceRole, 'org_owner'),
        eq(employees.isActive, true)
      ))
      .limit(1);
    if (!ownerEmp?.userId) return null;

    const [ownerUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, ownerEmp.userId))
      .limit(1);
    return ownerUser ? { userId: ownerUser.id, email: ownerUser.email } : null;
  } catch {
    return null;
  }
}

async function pollPendingTransfers(): Promise<void> {
  if (isPolling) {
    log.warn('[PayrollTransferMonitor] Previous poll cycle still running — skipping this tick');
    return;
  }
  isPolling = true;

  try {
    const pending = await db
      .select({
        id: payStubs.id,
        workspaceId: payStubs.workspaceId,
        payrollRunId: payStubs.payrollRunId,
        employeeId: payStubs.employeeId,
        netPay: payStubs.netPay,
        plaidTransferId: payStubs.plaidTransferId,
        plaidTransferStatus: payStubs.plaidTransferStatus,
      })
      .from(payStubs)
      .where(
        and(
          isNotNull(payStubs.plaidTransferId),
          inArray(payStubs.plaidTransferStatus as any, ['pending', 'posted'])
        )
      )
      .limit(100);

    if (!pending.length) return;

    log.info(`[PayrollTransferMonitor] Polling ${pending.length} pending transfers`);

    for (const stub of pending) {
      if (!stub.plaidTransferId) continue;
      try {
        const { status, failureReason } = await getTransferStatus(stub.plaidTransferId);

        // Reset failure counter on any successful Plaid API response
        consecutiveFailures.delete(stub.plaidTransferId);

        if (status === stub.plaidTransferStatus) continue; // No change

        await db
          .update(payStubs)
          .set({
            plaidTransferStatus: status,
            plaidTransferFailureReason: failureReason || null,
            updatedAt: new Date(),
          })
          .where(eq(payStubs.id, stub.id));

        broadcastToWorkspace(stub.workspaceId, {
          type: 'plaid_transfer_updated',
          payStubId: stub.id,
          payrollRunId: stub.payrollRunId,
          employeeId: stub.employeeId,
          transferId: stub.plaidTransferId,
          status,
          failureReason: failureReason || null,
        });

        if (status === 'settled') {
          platformEventBus.publish({
            type: 'payroll_transfer_settled',
            category: 'finance',
            title: 'Payroll Transfer Settled',
            description: `ACH transfer settled for employee ${stub.employeeId} — $${stub.netPay}`,
            workspaceId: stub.workspaceId,
            metadata: {
              payStubId: stub.id,
              payrollRunId: stub.payrollRunId,
              employeeId: stub.employeeId,
              transferId: stub.plaidTransferId,
              amount: stub.netPay,
            },
          }).catch((err) => log.warn('[payrollTransferMonitor] Fire-and-forget failed:', err));
        } else if (status === 'failed' || status === 'returned') {
          platformEventBus.publish({
            type: 'payroll_transfer_failed',
            category: 'finance',
            title: 'Payroll Transfer Failed',
            description: `ACH transfer ${status} for employee ${stub.employeeId}: ${failureReason || 'No reason provided'}`,
            workspaceId: stub.workspaceId,
            metadata: {
              payStubId: stub.id,
              payrollRunId: stub.payrollRunId,
              employeeId: stub.employeeId,
              transferId: stub.plaidTransferId,
              status,
              failureReason,
            },
          }).catch((err) => log.warn('[payrollTransferMonitor] Fire-and-forget failed:', err));
        }
      } catch (err: unknown) {
        // G19 FIX: Count consecutive Plaid API failures per transfer.
        // Silent swallowing left pay stubs stuck in 'pending' with no alert.
        const current = (consecutiveFailures.get(stub.plaidTransferId!) ?? 0) + 1;
        consecutiveFailures.set(stub.plaidTransferId!, current);

        log.warn(
          `[PayrollTransferMonitor] Poll failure #${current} for transfer ${stub.plaidTransferId}: ${(err instanceof Error ? err.message : String(err))}`
        );

        // Publish event for Trinity/notification pipeline on every failure
        platformEventBus.publish({
          type: 'payroll_transfer_failed',
          category: 'finance',
          title: 'Payroll Transfer — Polling Error',
          description: `ACH transfer ${stub.plaidTransferId} could not be polled from Plaid (attempt ${current}): ${(err instanceof Error ? err.message : String(err))}. Manual verification may be required.`,
          workspaceId: stub.workspaceId,
          metadata: {
            payStubId: stub.id,
            payrollRunId: stub.payrollRunId,
            employeeId: stub.employeeId,
            transferId: stub.plaidTransferId,
            status: 'polling_error',
            failureReason: err.message,
            consecutiveFailures: current,
          },
        }).catch((err) => log.warn('[payrollTransferMonitor] Fire-and-forget failed:', err));

        // After threshold: mark pay stub poll_failed + in-app notification + email
        if (current >= CONSECUTIVE_FAILURE_THRESHOLD) {
          log.error(
            `[PayrollTransferMonitor] Transfer ${stub.plaidTransferId} hit ${current} consecutive failures — marking poll_failed`
          );

          try {
            await db
              .update(payStubs)
              .set({ plaidTransferStatus: 'poll_failed' as any, updatedAt: new Date() })
              .where(eq(payStubs.id, stub.id));
          } catch (updateErr: unknown) {
            log.error('[PayrollTransferMonitor] Failed to mark poll_failed:', updateErr.message);
          }

          // Remove from counter so future manual retries start fresh
          consecutiveFailures.delete(stub.plaidTransferId!);

          const owner = await getOrgOwnerForWorkspace(stub.workspaceId);
          if (owner) {
            // In-app notification
            createNotification({
              workspaceId: stub.workspaceId,
              userId: owner.userId,
              type: 'payroll_alert',
              title: 'Payroll Transfer Requires Manual Verification',
              message: `ACH transfer ${stub.plaidTransferId} for employee ${stub.employeeId} could not be polled after ${current} attempts. The transfer status has been set to "poll_failed". Please verify the transfer status directly in your Plaid dashboard and update this record manually.`,
              relatedEntityType: 'pay_stub',
              relatedEntityId: stub.id,
              metadata: { transferId: stub.plaidTransferId, consecutiveFailures: current },
              idempotencyKey: `payroll_alert-${stub.id}-${owner.userId}`
            }).catch(e => log.warn('[PayrollTransferMonitor] Notification failed:', e.message));

            // Email escalation
            const { NotificationDeliveryService } = await import('./notificationDeliveryService');
            NotificationDeliveryService.send({
              type: 'payroll_notification',
              workspaceId: stub.workspaceId,
              recipientUserId: owner.userId,
              channel: 'email',
              subject: 'ACTION REQUIRED: Payroll Transfer Monitoring Failure',
              body: {
                to: owner.email,
                subject: 'ACTION REQUIRED: Payroll Transfer Monitoring Failure',
                html: `
                <p>A payroll ACH transfer requires manual verification.</p>
                <ul>
                  <li><strong>Transfer ID:</strong> ${stub.plaidTransferId}</li>
                  <li><strong>Employee ID:</strong> ${stub.employeeId}</li>
                  <li><strong>Net Pay:</strong> $${stub.netPay}</li>
                  <li><strong>Failed Polls:</strong> ${current}</li>
                  <li><strong>Last Error:</strong> ${err.message}</li>
                </ul>
                <p>The transfer status has been marked as <strong>poll_failed</strong>. 
                Please verify the transfer in your Plaid dashboard and update the status manually in CoAIleague.</p>
              `,
              }
            }).catch(e => log.warn('[PayrollTransferMonitor] Email escalation failed:', e.message));
          }
        }
      }
    }
  } catch (err: unknown) {
    log.error('[PayrollTransferMonitor] Poll cycle error:', (err instanceof Error ? err.message : String(err)));
  } finally {
    isPolling = false;
  }
}

export function startPayrollTransferMonitor(): void {
  if (pollTimer) return; // Already running
  log.info('[PayrollTransferMonitor] Starting — polling every 5 minutes');
  pollTimer = setInterval(pollPendingTransfers, POLL_INTERVAL_MS);
  pollPendingTransfers().catch((err: unknown) => log.error('[PayrollTransferMonitor] Initial poll failed', err)); // Run immediately on startup
}

export function stopPayrollTransferMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log.info('[PayrollTransferMonitor] Stopped');
  }
}
