/**
 * SMS Queue Service
 *
 * Provides batch-safe SMS sending for mass broadcasts.
 * All high-volume SMS (> 10 recipients) goes through this service.
 * Direct sendSMS() calls are still used for urgent 1:1 messages.
 *
 * Throughput: 10 messages / 1.1s = ~9 msg/sec (safe under Twilio A2P 10DLC 10/sec limit).
 * Upgrade path: for short codes, raise BATCH_SIZE / lower INTERVAL_MS.
 */

import { pool } from '../../db';
import { sendSMS } from '../smsService';
import { createLogger } from '../../lib/logger';

const log = createLogger('SMSQueue');
const BATCH_SIZE = 10;
const INTERVAL_MS = 1100;
let workerRunning = false;

export interface QueuedMessage {
  workspaceId: string;
  to: string;
  body: string;
  type: string;
  userId?: string;
  employeeId?: string;
  priority?: number;      // 1 = urgent, 5 = normal, 10 = bulk
  sendAfter?: Date;
}

/**
 * Queue messages for rate-limited delivery. Returns immediately.
 */
export async function queueSMS(messages: QueuedMessage[]): Promise<{ queued: number; failed: number }> {
  if (!messages || !messages.length) return { queued: 0, failed: 0 };

  let queued = 0;
  let failed = 0;

  for (const m of messages) {
    if (!m.workspaceId || !m.to || !m.body) {
      failed++;
      continue;
    }
    try {
      await pool.query(
        `INSERT INTO sms_outbox
           (workspace_id, to_number, body, sms_type, user_id, employee_id, priority, send_after)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          m.workspaceId,
          m.to,
          m.body,
          m.type || 'notification',
          m.userId || null,
          m.employeeId || null,
          m.priority ?? 5,
          m.sendAfter || new Date(),
        ],
      );
      queued++;
    } catch (err: unknown) {
      log.warn('[SMSQueue] Insert failed:', err?.message);
      failed++;
    }
  }

  log.info(`[SMSQueue] Queued ${queued} messages (${failed} failed)`);
  ensureWorkerRunning();
  return { queued, failed };
}

/**
 * Drain the outbox — called by the cron scheduler and immediately after queueSMS.
 * Claims a batch atomically, sends via Twilio, updates statuses, sleeps, repeats.
 */
export async function processSMSOutbox(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;

  try {
    while (true) {
      let rows: any[] = [];
      try {
        const res = await pool.query(
          `UPDATE sms_outbox
              SET status = 'sending'
            WHERE id IN (
              SELECT id FROM sms_outbox
               WHERE status = 'queued'
                 AND send_after <= NOW()
                 AND retry_count < max_retries
               ORDER BY priority ASC, send_after ASC
               LIMIT $1
               FOR UPDATE SKIP LOCKED
            )
           RETURNING *`,
          [BATCH_SIZE],
        );
        rows = res.rows;
      } catch (err: unknown) {
        log.warn('[SMSQueue] Claim batch error:', err?.message);
        break;
      }

      if (!rows.length) break;

      await Promise.allSettled(
        rows.map(async (row) => {
          try {
            const result = await sendSMS({
              to: row.to_number,
              body: row.body,
              userId: row.user_id || undefined,
              type: row.sms_type,
              workspaceId: row.workspace_id,
            });

            if (result.success) {
              await pool.query(
                `UPDATE sms_outbox
                    SET status = 'sent', twilio_sid = $1, sent_at = NOW()
                  WHERE id = $2`,
                [result.messageId || null, row.id],
              );
            } else {
              await pool.query(
                `UPDATE sms_outbox
                    SET status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'queued' END,
                        retry_count = retry_count + 1,
                        failure_reason = $1,
                        failed_at = CASE WHEN retry_count + 1 >= max_retries THEN NOW() ELSE failed_at END,
                        send_after = NOW() + INTERVAL '5 minutes'
                  WHERE id = $2`,
                [(result.error || 'unknown').slice(0, 200), row.id],
              );
            }
          } catch (err: unknown) {
            await pool.query(
              `UPDATE sms_outbox
                  SET status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'queued' END,
                      retry_count = retry_count + 1,
                      failure_reason = $1,
                      send_after = NOW() + INTERVAL '5 minutes'
                WHERE id = $2`,
              [String(err?.message || 'unknown').slice(0, 200), row.id],
            ).catch(() => {});
          }
        }),
      );

      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  } finally {
    workerRunning = false;
  }
}

function ensureWorkerRunning() {
  if (!workerRunning) {
    processSMSOutbox().catch((err) => log.warn('[SMSQueue] Worker error:', err?.message));
  }
}
