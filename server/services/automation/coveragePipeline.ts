/**
 * COVERAGE PIPELINE SERVICE - Trinity Autonomous Shift Coverage
 * ==============================================================
 * Three-Tier Staged Replacement Cascade (SCHED-6)
 *
 * When an employee calls off or is detected as NCNS, this service:
 * 1. Creates a coverage request record
 * 2. Classifies candidates into three tiers:
 *    - Tier 1: Stay-late eligible (currently on a shift ending near coverage start)
 *    - Tier 2: Internal qualified pool (not scheduled that day)
 *    - Tier 3: Full platform pool (remaining candidates)
 * 3. In standard mode: notifies Tier 1 only → waits 15 min → Tier 2 → waits 30 min → Tier 3
 * 4. In emergency mode (shift starts within 2 hours): collapses all tiers, notifies all simultaneously
 * 5. Acceptance at any tier cancels lower-tier queued notifications and closes the request
 * 6. No acceptance from any tier before shift start → manager escalation via NDS
 * 7. All tier transitions logged to shift_coverage_requests
 */

import { db } from '../../db';
import { 
  shiftCoverageRequests,
  shiftCoverageOffers,
  shifts, 
  employees, 
  replacementCascadeLogs,
} from '@shared/schema';
import { eq, and, ne, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { trinityAutomationToggle } from './trinityAutomationToggle';
import { automationOrchestration } from '../orchestration/automationOrchestration';
import { createLogger } from '../../lib/logger';
import { withDistributedLock, LOCK_KEYS } from '../distributedLock';

const log = createLogger('coverage-pipeline');

type InsertShiftCoverageRequest = typeof shiftCoverageRequests.$inferInsert;
type InsertShiftCoverageOffer = typeof shiftCoverageOffers.$inferInsert;
type ShiftCoverageRequest = typeof shiftCoverageRequests.$inferSelect;
type ShiftCoverageOffer = typeof shiftCoverageOffers.$inferSelect;

const COVERAGE_TIMEOUT_MINUTES = 60;
const COVERAGE_CHECK_INTERVAL_MS = 2 * 60 * 1000;

// Three-tier cascade timing constants
const TIER1_WINDOW_MINUTES = 15;
const TIER2_WINDOW_MINUTES = 30;
const EMERGENCY_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours in ms
const STAY_LATE_LOOKAHEAD_MS = 4 * 60 * 60 * 1000; // shifts ending within 4h of coverage start

interface CoverageCandidate {
  employeeId: string;
  employeeName: string;
  userId: string | null;
  aiScore: number;
  aiReason: string;
  tier: 1 | 2 | 3;
}

interface CoverageTriggerInput {
  shiftId: string;
  workspaceId: string;
  reason: 'call_off' | 'ncns' | 'sick' | 'emergency' | 'manual';
  reasonDetails?: string;
  originalEmployeeId?: string;
  timeoutMinutes?: number;
}

interface CoverageResult {
  success: boolean;
  coverageRequestId?: string;
  candidatesInvited?: number;
  error?: string;
}

class CoveragePipelineService {
  private static instance: CoveragePipelineService;
  private expiryCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): CoveragePipelineService {
    if (!this.instance) {
      this.instance = new CoveragePipelineService();
    }
    return this.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    log.info('Starting autonomous coverage pipeline with three-tier cascade...');
    this.isRunning = true;

    this.expiryCheckInterval = setInterval(async () => {
      try {
        await withDistributedLock(LOCK_KEYS.COVERAGE_PIPELINE, 'CoveragePipeline', async () => {
          await this.checkTierAdvancement();
          await this.checkExpiredRequests();
        });
      } catch (error: any) {
        log.warn('Check cycle failed (will retry)', { error: error?.message || 'unknown' });
      }
    }, COVERAGE_CHECK_INTERVAL_MS);

    await this.checkTierAdvancement();
    await this.checkExpiredRequests();
  }

  stop(): void {
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval);
      this.expiryCheckInterval = null;
    }
    this.isRunning = false;
    log.info('Stopped');
  }

  /**
   * Main entry point: trigger coverage pipeline for a shift
   */
  async triggerCoverage(input: CoverageTriggerInput): Promise<CoverageResult> {
    return automationOrchestration.executeAutomation(
      {
        domain: 'scheduling',
        // Scope the action name per-shift so the idempotency key is unique
        // per (workspace, shift) pair — prevents concurrent coverage triggers
        // for different shifts in the same workspace from blocking each other.
        automationName: `trigger-coverage-pipeline:${input.shiftId}`,
        automationType: 'background_process',
        workspaceId: input.workspaceId,
        triggeredBy: 'event',
        payload: input,
      },
      async (ctx) => {
        log.info(`Coverage triggered for shift ${input.shiftId} (${input.reason})`);

        const isEnabled = await trinityAutomationToggle.isFeatureAutomated(input.workspaceId, 'shift_monitoring');
        if (!isEnabled) {
          log.info('Shift monitoring automation is disabled for this workspace');
          return { success: false, error: 'Automation disabled for this workspace' };
        }

        const shift = await db.query.shifts.findFirst({
          where: eq(shifts.id, input.shiftId),
        });

        if (!shift) {
          return { success: false, error: 'Shift not found' };
        }

        const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const alreadyHandled = await db.query.shiftCoverageRequests.findFirst({
          where: and(
            eq(shiftCoverageRequests.originalShiftId, input.shiftId),
            gte(shiftCoverageRequests.createdAt, recentCutoff)
          ),
        });
        if (alreadyHandled) {
          return {
            success: true,
            coverageRequestId: alreadyHandled.id,
            candidatesInvited: alreadyHandled.candidatesInvited || 0,
          };
        }

        const timeoutMinutes = input.timeoutMinutes || COVERAGE_TIMEOUT_MINUTES;
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

        const requestData: InsertShiftCoverageRequest = {
          workspaceId: input.workspaceId,
          originalShiftId: input.shiftId,
          reason: input.reason,
          reasonDetails: input.reasonDetails,
          originalEmployeeId: input.originalEmployeeId || shift.employeeId || undefined,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          shiftDate: shift.date,
          shiftStartTime: new Date(shift.startTime),
          shiftEndTime: new Date(shift.endTime),
          clientId: shift.clientId || undefined,
          status: 'open',
          expiresAt,
          aiProcessed: false,
        };

        const inserted = await db.insert(shiftCoverageRequests)
          .values(requestData)
          .onConflictDoNothing()
          .returning();

        let coverageRequest = inserted[0];
        if (!coverageRequest) {
          const existingRequest = await db.query.shiftCoverageRequests.findFirst({
            where: and(
              eq(shiftCoverageRequests.originalShiftId, input.shiftId),
              eq(shiftCoverageRequests.status, 'open')
            ),
          });
          if (existingRequest) {
            log.info(`Idempotency guard — coverage request already exists for shift ${input.shiftId}`);
            return {
              success: true,
              coverageRequestId: existingRequest.id,
              candidatesInvited: existingRequest.candidatesInvited || 0,
            };
          }
          return { success: false, error: 'Coverage request conflict — unable to create or locate' };
        }

        log.info(`Created coverage request ${coverageRequest.id}`);

        const tieredCandidates = await this.findCandidates(shift, input.originalEmployeeId);

        if (tieredCandidates.length === 0) {
          log.info('No candidates found, escalating immediately');
          await this.escalateToOrgOwner(coverageRequest, 'No available employees found');
          return { success: true, coverageRequestId: coverageRequest.id, candidatesInvited: 0 };
        }

        // Determine if emergency mode (shift starts within 2 hours)
        const shiftStart = new Date(shift.startTime);
        const msUntilShift = shiftStart.getTime() - Date.now();
        const isEmergency = msUntilShift <= EMERGENCY_THRESHOLD_MS;

        await this.dispatchOffers(coverageRequest, tieredCandidates, isEmergency);

        const tier1Count = tieredCandidates.filter(c => c.tier === 1).length;
        const totalNotified = isEmergency ? tieredCandidates.length : tier1Count;

        await db.update(shiftCoverageRequests)
          .set({
            candidatesInvited: tieredCandidates.length,
            aiProcessed: true,
            updatedAt: new Date(),
          })
          .where(eq(shiftCoverageRequests.id, coverageRequest.id));

        if (isEmergency) {
          log.info(`EMERGENCY MODE — notified all ${tieredCandidates.length} candidates simultaneously for shift ${input.shiftId}`);
        } else {
          log.info(`Tier 1 dispatched (${tier1Count} candidates) for shift ${input.shiftId}. Tier 2 advances in ${TIER1_WINDOW_MINUTES} min.`);
        }

        return {
          success: true,
          coverageRequestId: coverageRequest.id,
          candidatesInvited: tieredCandidates.length,
        };
      }
    );
  }

  /**
   * Classify candidates into three tiers.
   *
   * Tier 1: Stay-late eligible — employees with a shift ending within 4h of the
   *         coverage shift start (they can extend their current shift).
   * Tier 2: Internal qualified pool — available employees with no shift conflict that day.
   * Tier 3: Full platform pool — remaining available employees with lower scores.
   */
  private async findCandidates(shift: any, excludeEmployeeId?: string): Promise<CoverageCandidate[]> {
    const shiftDate = shift.date;
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);

    const allEmployees = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, shift.workspaceId),
          eq(employees.isActive, true),
          excludeEmployeeId ? ne(employees.id, excludeEmployeeId) : undefined
        )
      );

    if (allEmployees.length === 0) return [];

    const employeeIds = allEmployees.map(e => e.id);

    // Employees with shift conflict on coverage day
    const conflictingShifts = await db.select({ employeeId: shifts.employeeId })
      .from(shifts)
      .where(
        and(
          eq(shifts.date, shiftDate),
          eq(shifts.workspaceId, shift.workspaceId),
          inArray(shifts.employeeId!, employeeIds),
          or(
            eq(shifts.status, 'scheduled'),
            eq(shifts.status, 'confirmed'),
            eq(shifts.status, 'pending')
          )
        )
      );

    const busyEmployeeIds = new Set(conflictingShifts.map(s => s.employeeId));

    // Employees with a shift ending within STAY_LATE_LOOKAHEAD_MS before coverage start
    // (their shift ends near the coverage shift start — stay-late eligible)
    const stayLateWindowStart = new Date(shiftStart.getTime() - STAY_LATE_LOOKAHEAD_MS);
    const stayLateShifts = await db.select({ employeeId: shifts.employeeId })
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, shift.workspaceId),
          inArray(shifts.employeeId!, employeeIds),
          or(eq(shifts.status, 'confirmed'), eq(shifts.status, 'in_progress')),
          gte(shifts.endTime, stayLateWindowStart),
          lte(shifts.endTime, shiftStart)
        )
      );

    const stayLateEmployeeIds = new Set(stayLateShifts.map(s => s.employeeId));

    const candidates: CoverageCandidate[] = [];

    // Employees with userId (need a linked account to receive notifications)
    const eligibleEmployees = allEmployees.filter(e => e.userId);

    // Tier 1: stay-late eligible (shift ending near coverage start, not conflicting with coverage)
    const tier1 = eligibleEmployees
      .filter(e => stayLateEmployeeIds.has(e.id) && !busyEmployeeIds.has(e.id))
      .slice(0, 3)
      .map((e, i) => ({
        employeeId: e.id,
        employeeName: `${e.firstName} ${e.lastName}`,
        userId: e.userId,
        aiScore: 95 - (i * 2),
        aiReason: `Stay-late eligible — current shift ends near coverage start`,
        tier: 1 as const,
      }));

    // Tier 2: available employees not scheduled that day, not already in Tier 1
    const tier1Ids = new Set(tier1.map(c => c.employeeId));
    const tier2 = eligibleEmployees
      .filter(e => !busyEmployeeIds.has(e.id) && !stayLateEmployeeIds.has(e.id) && !tier1Ids.has(e.id))
      .slice(0, 5)
      .map((e, i) => ({
        employeeId: e.id,
        employeeName: `${e.firstName} ${e.lastName}`,
        userId: e.userId,
        aiScore: 75 - (i * 3),
        aiReason: `Available and not scheduled on ${shiftDate}`,
        tier: 2 as const,
      }));

    // Tier 3: remaining available employees (broader pool)
    const tier2Ids = new Set(tier2.map(c => c.employeeId));
    const tier3 = eligibleEmployees
      .filter(e => !busyEmployeeIds.has(e.id) && !tier1Ids.has(e.id) && !tier2Ids.has(e.id))
      .slice(0, 5)
      .map((e, i) => ({
        employeeId: e.id,
        employeeName: `${e.firstName} ${e.lastName}`,
        userId: e.userId,
        aiScore: 50 - (i * 2),
        aiReason: `Platform pool — available for coverage`,
        tier: 3 as const,
      }));

    // Fallback: if Tier 1 is empty, promote Tier 2 candidates to Tier 1
    if (tier1.length === 0 && tier2.length > 0) {
      const promoted = tier2.splice(0, Math.min(3, tier2.length)).map(c => ({ ...c, tier: 1 as const }));
      candidates.push(...promoted);
    } else {
      candidates.push(...tier1);
    }

    candidates.push(...tier2, ...tier3);

    log.info(`Found ${candidates.length} tiered candidates: T1=${tier1.length} T2=${tier2.length} T3=${tier3.length}`);
    return candidates;
  }

  /**
   * Dispatch coverage offers using the three-tier staged cascade.
   *
   * Standard mode: notify Tier 1, queue Tier 2 & 3, set timer window.
   * Emergency mode: collapse all tiers, notify all simultaneously.
   */
  private async dispatchOffers(
    request: ShiftCoverageRequest,
    candidates: CoverageCandidate[],
    isEmergency: boolean
  ): Promise<void> {
    const shiftTimeStr = new Date(request.shiftStartTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const shiftDateStr = new Date(request.shiftStartTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const now = new Date();
    const tier1WindowExpires = new Date(now.getTime() + TIER1_WINDOW_MINUTES * 60 * 1000);

    // Create all offer records — Tier 1 as 'pending' (notified), Tier 2/3 as 'queued' (not yet notified)
    for (const candidate of candidates) {
      try {
        const shouldNotifyNow = isEmergency || candidate.tier === 1;
        const offerStatus = shouldNotifyNow ? 'pending' : 'queued';

        const offerData: any = {
          coverageRequestId: request.id,
          employeeId: candidate.employeeId,
          workspaceId: request.workspaceId,
          status: offerStatus,
          tier: candidate.tier,
          aiScore: candidate.aiScore.toString(),
          aiReason: candidate.aiReason,
        };

        const [offer] = await db.insert(shiftCoverageOffers)
          .values(offerData)
          .returning();

        // Log to replacement_cascade_logs for unified auditing
        await db.insert(replacementCascadeLogs).values({
          workspaceId: request.workspaceId,
          shiftId: request.originalShiftId,
          calloffId: request.reason === 'call_off' ? request.reasonDetails : null, // Best effort mapping
          cascadeTier: candidate.tier,
          notificationsSent: 1,
          cascadeStatus: 'active',
          startedAt: now,
        }).onConflictDoNothing();

        if (shouldNotifyNow && candidate.userId) {
          const urgencyPrefix = isEmergency ? '[URGENT] ' : '';
          await universalNotificationEngine.sendNotification({
            workspaceId: request.workspaceId,
            userId: candidate.userId,
            type: 'coverage_offer',
            title: `${urgencyPrefix}Can you cover a shift on ${shiftDateStr}?`,
            message: isEmergency
              ? `EMERGENCY: We urgently need someone to fill a shift at ${shiftTimeStr}. First to accept gets the shift!`
              : candidate.tier === 1
              ? `You may be eligible to stay late and cover a ${shiftTimeStr} shift. First to accept gets it!`
              : `We need someone to fill a shift at ${shiftTimeStr}. First to accept gets the shift!`,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: isEmergency ? 'critical' : 'high',
            metadata: {
              coverageRequestId: request.id,
              coverageOfferId: offer.id,
              shiftId: request.originalShiftId,
              shiftDate: request.shiftDate,
              shiftStartTime: request.shiftStartTime,
              shiftEndTime: request.shiftEndTime,
              tier: candidate.tier,
              isEmergency,
              source: 'coverage_pipeline',
              actionable: true,
              actions: [
                { type: 'accept', label: 'Accept Shift', endpoint: `/api/coverage/accept/${offer.id}` },
                { type: 'decline', label: 'Decline', endpoint: `/api/coverage/decline/${offer.id}` },
              ],
            },
          });

          await db.update(shiftCoverageOffers)
            .set({ notificationId: offer.id })
            .where(eq(shiftCoverageOffers.id, offer.id));
        }

        log.info(`${shouldNotifyNow ? 'Notified' : 'Queued'} Tier ${candidate.tier} offer for employee ${candidate.employeeId}`);
      } catch (error) {
        log.error(`Failed to create offer for employee ${candidate.employeeId}`, { error });
      }
    }

    // Update request tier tracking fields
    const tierUpdates: Record<string, any> = { updatedAt: new Date() };

    if (isEmergency) {
      // Emergency: all tiers notified simultaneously
      tierUpdates.currentTier = 3;
      tierUpdates.tier1NotifiedAt = now;
      tierUpdates.tier2NotifiedAt = now;
      tierUpdates.tier3NotifiedAt = now;
      tierUpdates.tierWindowExpiresAt = null;
      tierUpdates.trinityNotes = 'EMERGENCY MODE: All tiers notified simultaneously';
    } else {
      // Standard: Tier 1 only, set window timer
      tierUpdates.currentTier = 1;
      tierUpdates.tier1NotifiedAt = now;
      tierUpdates.tierWindowExpiresAt = tier1WindowExpires;
      tierUpdates.trinityNotes = `Tier 1 notified (${candidates.filter(c => c.tier === 1).length} candidates). Tier 2 advances at ${tier1WindowExpires.toISOString()}`;
    }

    await db.update(shiftCoverageRequests)
      .set(tierUpdates)
      .where(eq(shiftCoverageRequests.id, request.id));
  }

  /**
   * Advance open requests to the next tier if the current tier window has expired
   * and no one has accepted yet.
   * Called every COVERAGE_CHECK_INTERVAL_MS.
   */
  private async checkTierAdvancement(): Promise<void> {
    try {
      const now = new Date();

      // Find open requests with an expired tier window and room to advance
      const readyToAdvance = await db.select()
        .from(shiftCoverageRequests)
        .where(
          and(
            eq(shiftCoverageRequests.status, 'open'),
            lte(shiftCoverageRequests.tierWindowExpiresAt, now),
            sql`${shiftCoverageRequests.currentTier} < 3`
          )
        );

      for (const request of readyToAdvance) {
        const currentTier = request.currentTier || 1;
        const nextTier = (currentTier + 1) as 2 | 3;

        log.info(`Advancing request ${request.id} from Tier ${currentTier} to Tier ${nextTier}`);

        // Find queued offers for the next tier
        const queuedOffers = await db.select()
          .from(shiftCoverageOffers)
          .where(
            and(
              eq(shiftCoverageOffers.coverageRequestId, request.id),
              eq(shiftCoverageOffers.tier, nextTier),
              eq(shiftCoverageOffers.status, 'queued')
            )
          );

        if (queuedOffers.length === 0) {
          // No candidates queued for next tier — skip to next or escalate
          log.info(`No Tier ${nextTier} candidates queued for request ${request.id}`);
          if (nextTier === 3) {
            // No more tiers — escalate
            await this.escalateToOrgOwner(request as any, `No candidates responded through Tier 2 and no Tier 3 pool`);
          } else {
            // Advance current_tier counter so next cycle can try Tier 3
            const tier3Window = new Date(now.getTime() + TIER2_WINDOW_MINUTES * 60 * 1000);
            await db.update(shiftCoverageRequests)
              .set({
                currentTier: nextTier,
                tierWindowExpiresAt: tier3Window,
                updatedAt: now,
              })
              .where(eq(shiftCoverageRequests.id, request.id));
          }
          continue;
        }

        // Activate queued offers for next tier
        const shiftTimeStr = new Date(request.shiftStartTime).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
        const shiftDateStr = new Date(request.shiftStartTime).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });

        for (const offer of queuedOffers) {
          try {
            // Fetch employee for userId
            const [emp] = await db.select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
              .from(employees)
              .where(eq(employees.id, offer.employeeId))
              .limit(1);

            await db.update(shiftCoverageOffers)
              .set({ status: 'pending', updatedAt: now })
              .where(eq(shiftCoverageOffers.id, offer.id));

            if (emp?.userId) {
              const tierLabel = nextTier === 2 ? 'We still need coverage' : 'Final call for coverage';
              await universalNotificationEngine.sendNotification({
                workspaceId: request.workspaceId,
                userId: emp.userId,
                type: 'coverage_offer',
                title: `${tierLabel} — shift on ${shiftDateStr}`,
                message: `Can you cover a shift at ${shiftTimeStr}? We still need someone. First to accept gets it!`,
                // @ts-expect-error — TS migration: fix in refactoring sprint
                severity: 'high',
                metadata: {
                  coverageRequestId: request.id,
                  coverageOfferId: offer.id,
                  shiftId: request.originalShiftId,
                  shiftDate: request.shiftDate,
                  shiftStartTime: request.shiftStartTime,
                  shiftEndTime: request.shiftEndTime,
                  tier: nextTier,
                  source: 'coverage_pipeline_tier_advance',
                  actionable: true,
                  actions: [
                    { type: 'accept', label: 'Accept Shift', endpoint: `/api/coverage/accept/${offer.id}` },
                    { type: 'decline', label: 'Decline', endpoint: `/api/coverage/decline/${offer.id}` },
                  ],
                },
              });
            }
          } catch (err) {
            log.error(`Failed to advance offer ${offer.id} to Tier ${nextTier}`, { error: err });
          }
        }

        // Calculate next tier window
        const windowMinutes = nextTier === 2 ? TIER2_WINDOW_MINUTES : null;
        const nextWindowExpires = windowMinutes
          ? new Date(now.getTime() + windowMinutes * 60 * 1000)
          : null;

        // Build update payload with typed key
        const tierNotifiedKey = `tier${nextTier}NotifiedAt` as 'tier2NotifiedAt' | 'tier3NotifiedAt';
        await db.update(shiftCoverageRequests)
          .set({
            currentTier: nextTier,
            [tierNotifiedKey]: now,
            tierWindowExpiresAt: nextWindowExpires,
            trinityNotes: `Tier ${nextTier} notified (${queuedOffers.length} candidates). ${nextWindowExpires ? `Tier ${nextTier + 1} advances at ${nextWindowExpires.toISOString()}` : 'Final tier — escalate if no response.'}`,
            updatedAt: now,
          })
          .where(eq(shiftCoverageRequests.id, request.id));

        log.info(`Tier ${nextTier} dispatched for request ${request.id} (${queuedOffers.length} candidates)`);
      }
    } catch (error) {
      log.error('Error in tier advancement check', { error });
    }
  }

  /**
   * Handle employee accepting a coverage offer - atomic first-accept-wins
   *
   * RACE CONDITION FIX: Uses SELECT FOR UPDATE to acquire exclusive row locks
   * on both the offer and request, ensuring only one concurrent transaction
   * can proceed with acceptance. The atomic conditional update on the request
   * status provides a second layer of protection.
   */
  async acceptOffer(offerId: string, employeeId: string): Promise<{ success: boolean; message: string; shiftId?: string }> {
    log.info(`Employee ${employeeId} accepting offer ${offerId}`);

    return await db.transaction(async (tx) => {
      const offerResult = await tx.execute(sql`
        SELECT * FROM shift_coverage_offers
        WHERE id = ${offerId} AND employee_id = ${employeeId}
        FOR UPDATE
      `);

      const offer = (offerResult.rows as any[])[0];

      if (!offer) {
        return { success: false, message: 'Offer not found or not for this employee' };
      }

      if (offer.status !== 'pending') {
        return { success: false, message: `Offer already ${offer.status}` };
      }

      const requestResult = await tx.execute(sql`
        SELECT * FROM shift_coverage_requests
        WHERE id = ${offer.coverage_request_id}
        FOR UPDATE
      `);

      const request = (requestResult.rows as any[])[0];

      if (!request) {
        return { success: false, message: 'Coverage request not found' };
      }

      if (request.status !== 'open') {
        await tx.update(shiftCoverageOffers)
          .set({ status: 'superseded', respondedAt: new Date(), updatedAt: new Date() })
          .where(eq(shiftCoverageOffers.id, offerId));
        return { success: false, message: 'Sorry, someone else already accepted this shift' };
      }

      const updateResult = await tx.execute(sql`
        UPDATE shift_coverage_requests
        SET status = 'accepted',
            accepted_at = NOW(),
            accepted_by_employee_id = ${employeeId},
            updated_at = NOW()
        WHERE id = ${request.id} AND status = 'open'
        RETURNING id
      `);

      if (!updateResult.rows || updateResult.rows.length === 0) {
        await tx.update(shiftCoverageOffers)
          .set({ status: 'superseded', respondedAt: new Date(), updatedAt: new Date() })
          .where(eq(shiftCoverageOffers.id, offerId));
        return { success: false, message: 'Sorry, someone else already accepted this shift' };
      }

      await tx.update(shiftCoverageOffers)
        .set({ status: 'accepted', respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(shiftCoverageOffers.id, offerId));

      // Cancel all remaining pending and queued offers (cross-tier cleanup)
      await tx.update(shiftCoverageOffers)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(shiftCoverageOffers.coverageRequestId, request.id),
            ne(shiftCoverageOffers.id, offerId),
            or(
              eq(shiftCoverageOffers.status, 'pending'),
              eq(shiftCoverageOffers.status, 'queued')
            )
          )
        );

      const [originalShift] = await tx.select()
        .from(shifts)
        .where(eq(shifts.id, request.original_shift_id))
        .limit(1);

      let newShiftId: string | undefined;

      if (originalShift) {
        const [newShift] = await tx.insert(shifts)
          .values({
            workspaceId: request.workspace_id,
            employeeId: employeeId,
            clientId: originalShift.clientId,
            title: `${originalShift.title || 'Shift'} (Coverage)`,
            date: originalShift.date,
            startTime: new Date(originalShift.startTime),
            endTime: new Date(originalShift.endTime),
            status: 'confirmed',
            aiGenerated: true,
            description: `Coverage for original shift ${originalShift.id}. Reason: ${request.reason}`,
          } as any)
          .returning();

        newShiftId = newShift.id;

        await tx.update(shifts)
          .set({
            status: 'cancelled',
            description: `Cancelled - covered by shift ${newShiftId}`,
          } as any)
          .where(eq(shifts.id, request.original_shift_id));
      }

      await tx.update(shiftCoverageRequests)
        .set({
          newShiftId: newShiftId,
          updatedAt: new Date(),
        })
        .where(eq(shiftCoverageRequests.id, request.id));

      log.info(`Employee ${employeeId} successfully accepted coverage, new shift: ${newShiftId}`);
      return { success: true, message: 'You got the shift! Check your schedule.', shiftId: newShiftId };
    });
  }

  /**
   * Handle employee declining a coverage offer
   */
  async declineOffer(offerId: string, employeeId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    log.info(`Employee ${employeeId} declining offer ${offerId}`);

    const offer = await db.query.shiftCoverageOffers.findFirst({
      where: and(
        eq(shiftCoverageOffers.id, offerId),
        eq(shiftCoverageOffers.employeeId, employeeId)
      ),
    });

    if (!offer) {
      return { success: false, message: 'Offer not found' };
    }

    if (offer.status !== 'pending') {
      return { success: false, message: `Offer already ${offer.status}` };
    }

    await db.update(shiftCoverageOffers)
      .set({
        status: 'declined',
        respondedAt: new Date(),
        declineReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(shiftCoverageOffers.id, offerId));

    await db.update(shiftCoverageRequests)
      .set({
        offersDeclined: sql`${shiftCoverageRequests.offersDeclined} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(shiftCoverageRequests.id, offer.coverageRequestId));

    return { success: true, message: 'Response recorded. Thanks for letting us know!' };
  }

  /**
   * Check for fully expired coverage requests (past expiresAt with no acceptance) and escalate
   */
  private async checkExpiredRequests(): Promise<void> {
    try {
      const expiredRequests = await db.select()
        .from(shiftCoverageRequests)
        .where(
          and(
            eq(shiftCoverageRequests.status, 'open'),
            lte(shiftCoverageRequests.expiresAt, new Date())
          )
        );

      for (const request of expiredRequests) {
        log.info(`Request ${request.id} fully expired, escalating`);

        await db.update(shiftCoverageOffers)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(
            and(
              eq(shiftCoverageOffers.coverageRequestId, request.id),
              or(
                eq(shiftCoverageOffers.status, 'pending'),
                eq(shiftCoverageOffers.status, 'queued')
              )
            )
          );

        await this.escalateToOrgOwner(request, 'No employees accepted through any tier within the time limit');
      }
    } catch (error) {
      log.error('Error checking expired requests', { error });
    }
  }

  /**
   * Escalate to org owner when no coverage found
   */
  private async escalateToOrgOwner(request: ShiftCoverageRequest, reason: string): Promise<void> {
    await db.update(shiftCoverageRequests)
      .set({
        status: 'escalated',
        escalatedAt: new Date(),
        trinityNotes: reason,
        updatedAt: new Date(),
      })
      .where(eq(shiftCoverageRequests.id, request.id));

    const orgOwners = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, request.workspaceId),
          or(
            eq(employees.workspaceRole as any, 'org_owner'),
            eq(employees.workspaceRole as any, 'co_owner')
          )
        )
      );

    const shiftTimeStr = new Date(request.shiftStartTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const shiftDateStr = new Date(request.shiftStartTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    for (const owner of orgOwners) {
      if (owner.userId) {
        await universalNotificationEngine.sendNotification({
          workspaceId: request.workspaceId,
          userId: owner.userId,
          type: 'issue_detected',
          title: 'Shift Coverage Needed - Manual Action Required',
          message: `I couldn't find coverage for the ${shiftDateStr} at ${shiftTimeStr} shift. ${reason}. Please assign manually.`,
          severity: 'critical',
          metadata: {
            coverageRequestId: request.id,
            shiftId: request.originalShiftId,
            reason: request.reason,
            escalationReason: reason,
            candidatesInvited: request.candidatesInvited,
            offersDeclined: request.offersDeclined,
            source: 'coverage_pipeline_escalation',
          },
        });
      }
    }

    log.info(`Escalated to ${orgOwners.length} org owner(s) via UNE`);
  }

  /**
   * Get coverage request status
   */
  async getRequestStatus(requestId: string): Promise<ShiftCoverageRequest | null> {
    const request = await db.query.shiftCoverageRequests.findFirst({
      where: eq(shiftCoverageRequests.id, requestId),
    });
    return request || null;
  }

  /**
   * Get all offers for a coverage request
   */
  async getRequestOffers(requestId: string): Promise<ShiftCoverageOffer[]> {
    return db.query.shiftCoverageOffers.findMany({
      where: eq(shiftCoverageOffers.coverageRequestId, requestId),
    });
  }
}

export const coveragePipeline = CoveragePipelineService.getInstance();
