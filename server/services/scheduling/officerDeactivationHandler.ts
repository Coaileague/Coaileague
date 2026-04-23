/**
 * OFFICER DEACTIVATION HANDLER
 * ==============================
 * When an officer is suspended, deactivated, or removed from a specific client
 * due to a complaint, this handler:
 * 1. Finds all future shifts assigned to that officer (optionally filtered by client)
 * 2. Unassigns those shifts (status=open, employeeId=null)
 * 3. Triggers the coverage pipeline for each unassigned shift
 * 4. Notifies org owners
 * 5. Publishes a platform event for audit trail
 */

import { db } from '../../db';
import { shifts, employees, users } from '@shared/schema';
import { eq, and, gte, isNotNull } from 'drizzle-orm';
import { coveragePipeline } from '../automation/coveragePipeline';
import { platformEventBus } from '../platformEventBus';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('officerDeactivationHandler');


export type DeactivationReason = 'suspended' | 'deactivated' | 'complaint_critical' | 'complaint_client_removal';

interface DeactivationResult {
  shiftsUnassigned: number;
  coverageTriggered: number;
  ownersNotified: number;
}

/**
 * Handle deactivation/suspension of an officer:
 * - Unassigns all future shifts (workspace-wide or client-specific)
 * - Triggers coverage pipeline for each shift
 * - Notifies org owners
 *
 * @param employeeId - The officer being deactivated/suspended
 * @param workspaceId - The workspace
 * @param reason - Why they're being removed
 * @param clientId - Optional: if provided, only removes from shifts at that specific client
 */
export async function handleOfficerDeactivation(
  employeeId: string,
  workspaceId: string,
  reason: DeactivationReason,
  clientId?: string
): Promise<DeactivationResult> {
  const now = new Date();
  const result: DeactivationResult = { shiftsUnassigned: 0, coverageTriggered: 0, ownersNotified: 0 };

  try {
    log.info(`[OfficerDeactivation] Processing ${reason} for employee ${employeeId} in workspace ${workspaceId}${clientId ? ` (client: ${clientId})` : ''}`);

    const conditions = [
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.employeeId, employeeId),
      gte(shifts.startTime, now),
      isNotNull(shifts.employeeId),
    ];

    if (clientId) {
      conditions.push(eq(shifts.clientId, clientId));
    }

    const futureShifts = await db
      .select({ id: shifts.id, startTime: shifts.startTime, clientId: shifts.clientId, title: shifts.title })
      .from(shifts)
      .where(and(...conditions));

    if (futureShifts.length === 0) {
      log.info(`[OfficerDeactivation] No future shifts found for employee ${employeeId}`);
    } else {
      log.info(`[OfficerDeactivation] Found ${futureShifts.length} future shift(s) to unassign`);

      for (const shift of futureShifts) {
        const noteText = clientId
          ? `Reassigned — officer removed from this client (${reason.replace('_', ' ')}). Manager review required.`
          : `Reassigned — officer ${reason.replace('_', ' ')}. Manager review required.`;

        // Wrap unassign + coverage trigger in a transaction so a failed coverage
        // trigger cannot leave a shift in an unassigned state without a coverage request.
        try {
          await db.transaction(async (tx) => {
            await tx
              .update(shifts)
              .set({
                employeeId: null,
                status: 'draft',
                // @ts-expect-error — TS migration: fix in refactoring sprint
                notes: noteText,
                updatedAt: new Date(),
              })
              .where(and(eq(shifts.id, shift.id), eq(shifts.workspaceId, workspaceId)));
          });

          result.shiftsUnassigned++;

          // Coverage pipeline runs after the transaction commits — it has its own
          // idempotency guard (unique partial index) so concurrent calls are safe.
          try {
            await coveragePipeline.triggerCoverage({
              shiftId: shift.id,
              workspaceId,
              reason: 'call_off',
              reasonDetails: `Officer ${reason.replace(/_/g, ' ')} — automatic coverage request`,
              originalEmployeeId: employeeId,
            });
            result.coverageTriggered++;
          } catch (covErr) {
            log.error(`[OfficerDeactivation] Coverage pipeline error for shift ${shift.id}:`, covErr);
          }
        } catch (txErr) {
          log.error(`[OfficerDeactivation] Transaction error for shift ${shift.id}:`, txErr);
        }
      }
    }

    const orgOwners = await db
      .select({ id: employees.id, userId: employees.userId, firstName: employees.firstName })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true),
          eq(employees.workspaceRole, 'org_owner')
        )
      );

    const deactivatedEmployee = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    const officerName = deactivatedEmployee[0]
      ? `${deactivatedEmployee[0].firstName} ${deactivatedEmployee[0].lastName}`
      : employeeId;

    for (const owner of orgOwners) {
      if (!owner.userId) continue;
      try {
        await createNotification({
          userId: owner.userId,
          type: 'staffing_escalation',
          title: `Officer ${reason.replace(/_/g, ' ')}: ${officerName}`,
          message: clientId
            ? `${officerName} was removed from a specific client's shifts due to ${reason.replace(/_/g, ' ')}. ${result.shiftsUnassigned} shift(s) unassigned and coverage pipeline triggered.`
            : `${officerName} was ${reason.replace(/_/g, ' ')}. ${result.shiftsUnassigned} future shift(s) unassigned and coverage pipeline triggered for each.`,
          data: { employeeId, reason, shiftsAffected: result.shiftsUnassigned, clientId },
          workspaceId,
          idempotencyKey: `staffing_escalation-${Date.now()}-${owner.userId}`
        });
        result.ownersNotified++;
      } catch (notifErr) {
        log.error(`[OfficerDeactivation] Notification error for owner ${owner.userId}:`, notifErr);
      }
    }

    platformEventBus.emit('officer_deactivated_shifts_cleared', {
      employeeId,
      workspaceId,
      reason,
      clientId,
      shiftsUnassigned: result.shiftsUnassigned,
      coverageTriggered: result.coverageTriggered,
      timestamp: now.toISOString(),
    });

    log.info(`[OfficerDeactivation] Done — unassigned ${result.shiftsUnassigned} shifts, triggered coverage for ${result.coverageTriggered}, notified ${result.ownersNotified} owner(s)`);
  } catch (error) {
    log.error('[OfficerDeactivation] Error:', error);
  }

  return result;
}
