/**
 * Coverage Escalation Service (S14)
 *
 * Scans `shift_coverage_requests` every ESCALATION_INTERVAL_MINUTES and
 * escalates requests whose `expires_at` has passed without resolution.
 *
 * An "escalated" request:
 *   - has `escalatedAt` set to the scan timestamp
 *   - emits a `shift_calloff_escalated` platform event (already handled by
 *     trinityEventSubscriptions.ts → org_owner / managers notification +
 *     thalamic_log write)
 *
 * The SLA itself lives on the row as `expires_at` (set by the calloff
 * intake service when a coverage request is opened). This service is the
 * enforcement loop: once the SLA is blown, management is alerted.
 *
 * Design notes:
 *   - Idempotent: the WHERE clause excludes rows that already have
 *     `escalated_at` set, so repeated scans never double-notify.
 *   - Workspace-scoped per row: the event carries `workspaceId` so
 *     tenant isolation is preserved downstream.
 *   - Non-blocking and catches per-row failures so one bad row cannot
 *     stop the whole sweep.
 */

import { db } from '../../db';
import { shiftCoverageRequests, shifts, sites } from '@shared/schema';
import { and, eq, lt, isNull, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('CoverageEscalation');

const DEFAULT_INTERVAL_MINUTES = 5;

class CoverageEscalationService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private intervalMinutes: number = DEFAULT_INTERVAL_MINUTES;
  private running = false;

  start(intervalMinutes: number = DEFAULT_INTERVAL_MINUTES): void {
    if (this.intervalHandle) {
      log.info('[CoverageEscalation] Already running — skipping start');
      return;
    }
    this.intervalMinutes = intervalMinutes;
    log.info(`[CoverageEscalation] Starting sweep every ${intervalMinutes} minute(s)`);
    // Run once immediately so restart doesn't miss a blown SLA
    this.sweep().catch(err => log.warn('[CoverageEscalation] Initial sweep failed:', err?.message));
    this.intervalHandle = setInterval(
      () => { this.sweep().catch(err => log.warn('[CoverageEscalation] Sweep failed:', err?.message)); },
      intervalMinutes * 60 * 1000,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('[CoverageEscalation] Stopped');
    }
  }

  /**
   * Scan once for blown SLAs and escalate each row found.
   * Exposed publicly so operators can trigger it manually from an admin route.
   */
  async sweep(): Promise<{ scanned: number; escalated: number }> {
    if (this.running) {
      return { scanned: 0, escalated: 0 };
    }
    this.running = true;
    let scanned = 0;
    let escalated = 0;

    try {
      const blown = await db
        .select({
          id: shiftCoverageRequests.id,
          workspaceId: shiftCoverageRequests.workspaceId,
          originalShiftId: shiftCoverageRequests.originalShiftId,
          shiftDate: shiftCoverageRequests.shiftDate,
          shiftStartTime: shiftCoverageRequests.shiftStartTime,
          clientId: shiftCoverageRequests.clientId,
          reason: shiftCoverageRequests.reason,
          originalEmployeeId: shiftCoverageRequests.originalEmployeeId,
          expiresAt: shiftCoverageRequests.expiresAt,
          candidatesInvited: shiftCoverageRequests.candidatesInvited,
          offersDeclined: shiftCoverageRequests.offersDeclined,
        })
        .from(shiftCoverageRequests)
        .where(and(
          eq(shiftCoverageRequests.status, 'open'),
          lt(shiftCoverageRequests.expiresAt, sql`NOW()`),
          isNull(shiftCoverageRequests.escalatedAt),
        ))
        .limit(200);

      scanned = blown.length;

      for (const row of blown) {
        try {
          // Pull site name for the notification payload (best-effort).
          let siteName: string | null = null;
          try {
            const [shiftRow] = await db.select({ siteId: shifts.siteId, title: shifts.title })
              .from(shifts)
              .where(eq(shifts.id, row.originalShiftId))
              .limit(1);
            if (shiftRow?.siteId) {
              const [site] = await db.select({ name: sites.name })
                .from(sites)
                .where(eq(sites.id, shiftRow.siteId))
                .limit(1);
              siteName = site?.name ?? shiftRow.title ?? null;
            } else {
              siteName = shiftRow?.title ?? null;
            }
          } catch (siteErr: any) {
            log.warn(`[CoverageEscalation] Site lookup failed for coverage ${row.id}: ${siteErr?.message}`);
          }

          // Mark escalated FIRST so a publish failure doesn't cause repeat alerts
          await db.update(shiftCoverageRequests)
            .set({ escalatedAt: new Date(), updatedAt: new Date() })
            .where(eq(shiftCoverageRequests.id, row.id));

          await platformEventBus.publish({
            type: 'shift_calloff_escalated',
            category: 'scheduling',
            title: '🚨 Calloff Uncovered — SLA Blown',
            description: `Coverage for shift ${row.originalShiftId} is still uncovered past SLA (expired ${row.expiresAt?.toISOString?.() ?? 'n/a'})`,
            workspaceId: row.workspaceId,
            metadata: {
              coverageRequestId: row.id,
              shiftId: row.originalShiftId,
              siteName,
              shiftDate: row.shiftDate,
              shiftStartTime: row.shiftStartTime,
              clientId: row.clientId,
              reason: row.reason,
              originalEmployeeId: row.originalEmployeeId,
              candidatesInvited: row.candidatesInvited,
              offersDeclined: row.offersDeclined,
              expiresAt: row.expiresAt,
            },
          });

          escalated++;
        } catch (rowErr: any) {
          log.error(`[CoverageEscalation] Failed to escalate coverage ${row.id}:`, rowErr?.message);
        }
      }

      if (scanned > 0) {
        log.info(`[CoverageEscalation] Sweep complete: scanned=${scanned} escalated=${escalated}`);
      }
    } finally {
      this.running = false;
    }

    return { scanned, escalated };
  }
}

export const coverageEscalationService = new CoverageEscalationService();
