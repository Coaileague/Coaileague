import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { hasManagerAccess } from "../rbac";
import { db } from "../db";
import {
  shifts,
  timeEntries,
  timeEntryBreaks,
  shiftOrders,
  shiftSwapRequests,
  scheduledBreaks,
  shiftChatrooms,
  shiftChatroomMessages,
  shiftChatroomMembers,
  trainingRuns,
  trainingScenarios,
  shiftActions
} from '@shared/schema';
import { eq, and, isNull, isNotNull, inArray, sql, not } from "drizzle-orm";
import { guardAgainstProduction } from "../services/workspaceGuard";
import { typedCount } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { trainingAttempts } from '@shared/schema';
const log = createLogger('TrinityTrainingRoutes');


const router = Router();

async function resolveWorkspaceId(req: AuthenticatedRequest): Promise<string | null> {
  const userId = req.user?.id || (req.user)?.claims?.sub;
  if (!userId) return null;

  const fromRequest = req.body?.workspaceId || req.query?.workspaceId;
  if (fromRequest) return fromRequest as string;

  const user = await storage.getUser(userId);
  return user?.currentWorkspaceId || null;
}

router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const { scenarioSeederService } = await import('../services/training/scenarioSeeder');
    const status = await scenarioSeederService.getTrainingStatus(workspaceId);

    res.json(status);
  } catch (error) {
    log.error("[TrinityTraining] Error getting status:", error);
    res.status(500).json({ message: "Failed to get training status" });
  }
});

router.post('/seed', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!hasManagerAccess((req.user)?.workspaceRole || req.user?.role)) {
      return res.status(403).json({ message: "Manager access required to seed training scenarios" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    await guardAgainstProduction(workspaceId, 'training/seed');

    const { difficulty } = req.body;
    if (!difficulty || !['easy', 'medium', 'hard', 'meta', 'extreme', 'org'].includes(difficulty)) {
      return res.status(400).json({ message: "Invalid difficulty. Must be 'easy', 'medium', 'hard', 'meta', 'extreme', or 'org'" });
    }

    const { scenarioSeederService } = await import('../services/training/scenarioSeeder');
    const result = await scenarioSeederService.seedScenario(workspaceId, difficulty as any);

    res.json({
      success: true,
      ...result,
      message: difficulty === 'org'
        ? `Successfully created ${result.shiftsCreated} org-data training shifts from ${(result as any).clientRatesUsed ?? 0} real client contracts`
        : `Successfully created ${result.shiftsCreated} training shifts at ${difficulty} difficulty`,
    });
  } catch (error: unknown) {
    log.error("[TrinityTraining] Error seeding scenario:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to seed training scenario" });
  }
});

/**
 * POST /api/trinity/training/seed-org
 * Seed Trinity training shifts from real org data:
 * - Real client billing rates from client_rates table
 * - Real employee pay rates from employees table  
 * - Real Acme staffing patterns (enterprise 24/7, mid-size, small business)
 * - Client-appropriate shift titles based on company type
 */
router.post('/seed-org', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!hasManagerAccess((req.user)?.workspaceRole || req.user?.role)) {
      return res.status(403).json({ message: "Manager access required to seed org training scenarios" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    await guardAgainstProduction(workspaceId, 'training/seed-org');

    const { scenarioSeederService } = await import('../services/training/scenarioSeeder');
    const result = await scenarioSeederService.seedWithOrgData(workspaceId);

    res.json({
      success: true,
      ...result,
      message: `Created ${result.shiftsCreated} org-data training shifts from ${result.clientRatesUsed} real client contracts — Trinity will now train on actual Acme staffing patterns`,
    });
  } catch (error: unknown) {
    log.error("[TrinityTraining] Error seeding org data scenario:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to seed org training scenario" });
  }
});

router.post('/clear', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!hasManagerAccess((req.user)?.workspaceRole || req.user?.role)) {
      return res.status(403).json({ message: "Manager access required to clear training assignments" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    await guardAgainstProduction(workspaceId, 'training/clear');

    const { scenarioSeederService } = await import('../services/training/scenarioSeeder');
    const result = await scenarioSeederService.clearAssignments(workspaceId);

    res.json({
      success: true,
      ...result,
      message: `Cleared ${result.shiftsCleared} shift assignments. Training shifts are now open again.`,
    });
  } catch (error) {
    log.error("[TrinityTraining] Error clearing assignments:", error);
    res.status(500).json({ message: "Failed to clear shift assignments" });
  }
});

router.post('/reset', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!hasManagerAccess((req.user)?.workspaceRole || req.user?.role)) {
      return res.status(403).json({ message: "Manager access required to reset training" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    await guardAgainstProduction(workspaceId, 'training/reset');

    const { scenarioSeederService } = await import('../services/training/scenarioSeeder');
    const result = await scenarioSeederService.resetTraining(workspaceId);

    res.json({
      success: true,
      ...result,
      message: `Successfully reset training. Deleted ${result.shiftsDeleted} training shifts.`,
    });
  } catch (error) {
    log.error("[TrinityTraining] Error resetting training:", error);
    res.status(500).json({ message: "Failed to reset training" });
  }
});

router.post('/start-run', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const { runId } = req.body;
    if (!runId) {
      return res.status(400).json({ message: "runId is required" });
    }

    const { scenarioSeederService } = await import('../services/training/scenarioSeeder');
    await scenarioSeederService.startTrainingRun(workspaceId, runId);

    res.json({
      success: true,
      message: "Training run started. I'm processing shifts now.",
    });
  } catch (error) {
    log.error("[TrinityTraining] Error starting run:", error);
    res.status(500).json({ message: "Failed to start training run" });
  }
});

router.post('/clear-all-schedule', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!hasManagerAccess((req.user)?.workspaceRole || req.user?.role)) {
      return res.status(403).json({ message: "Manager access required to clear all schedule data" });
    }

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    await guardAgainstProduction(workspaceId, 'clear-all-schedule');

    log.info(`[ClearSchedule] Clearing schedule data for workspace: ${workspaceId} (protecting financially-linked records)`);

    const protectedTimeEntries = await db.select({ id: timeEntries.id, invoiceId: timeEntries.invoiceId, payrollRunId: timeEntries.payrollRunId, shiftId: timeEntries.shiftId })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        sql`(${timeEntries.invoiceId} IS NOT NULL OR ${timeEntries.payrollRunId} IS NOT NULL)`
      ));

    const protectedTimeEntryIds = new Set(protectedTimeEntries.map(te => te.id));
    const protectedShiftIds = new Set(protectedTimeEntries.map(te => te.shiftId).filter(Boolean) as string[]);

    log.info(`[ClearSchedule] Protected: ${protectedTimeEntryIds.size} billed/payrolled time entries, ${protectedShiftIds.size} linked shifts`);

    const summary = await db.transaction(async (tx) => {
      const deletedTimeEntryBreaks = await tx.delete(timeEntryBreaks)
        .where(and(
          eq(timeEntryBreaks.workspaceId, workspaceId),
          protectedTimeEntryIds.size > 0
            ? not(inArray(timeEntryBreaks.timeEntryId, [...protectedTimeEntryIds]))
            : sql`true`
        ))
        .returning();

      const deletedTimeEntries = await tx.delete(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          isNull(timeEntries.invoiceId),
          isNull(timeEntries.payrollRunId)
        ))
        .returning();

      const workspaceRunIds = await tx.select({ id: trainingRuns.id })
        .from(trainingRuns)
        .where(eq(trainingRuns.workspaceId, workspaceId));
      
      let deletedTrainingAttempts: any[] = [];
      if (workspaceRunIds.length > 0) {
        deletedTrainingAttempts = await tx.delete(trainingAttempts)
          .where(inArray(trainingAttempts.runId, workspaceRunIds.map(r => r.id)))
          .returning();
      }

      const deletedTrainingRuns = await tx.delete(trainingRuns)
        .where(eq(trainingRuns.workspaceId, workspaceId))
        .returning();

      const deletedTrainingScenarios = await tx.delete(trainingScenarios)
        .where(eq(trainingScenarios.workspaceId, workspaceId))
        .returning();

      const deletedScheduledBreaks = await tx.delete(scheduledBreaks)
        .where(eq(scheduledBreaks.workspaceId, workspaceId))
        .returning();

      const deletedShiftActions = await tx.delete(shiftActions)
        .where(eq(shiftActions.workspaceId, workspaceId))
        .returning();

      const deletedSwapRequests = await tx.delete(shiftSwapRequests)
        .where(eq(shiftSwapRequests.workspaceId, workspaceId))
        .returning();

      const deletedShiftOrders = await tx.delete(shiftOrders)
        .where(eq(shiftOrders.workspaceId, workspaceId))
        .returning();

      const chatroomIds = await tx.select({ id: shiftChatrooms.id })
        .from(shiftChatrooms)
        .where(eq(shiftChatrooms.workspaceId, workspaceId));
      
      if (chatroomIds.length > 0) {
        const ids = chatroomIds.map(c => c.id);
        await tx.delete(shiftChatroomMessages)
          .where(inArray(shiftChatroomMessages.chatroomId, ids));
        await tx.delete(shiftChatroomMembers)
          .where(inArray(shiftChatroomMembers.chatroomId, ids));
      }
      
      await tx.delete(shiftChatrooms)
        .where(eq(shiftChatrooms.workspaceId, workspaceId));

      const deletedShifts = await tx.delete(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          protectedShiftIds.size > 0
            ? not(inArray(shifts.id, [...protectedShiftIds]))
            : sql`true`
        ))
        .returning();

      return {
        shiftsDeleted: deletedShifts.length,
        shiftsProtected: protectedShiftIds.size,
        timeEntriesDeleted: deletedTimeEntries.length,
        timeEntriesProtected: protectedTimeEntryIds.size,
        timeEntryBreaksDeleted: deletedTimeEntryBreaks.length,
        shiftOrdersDeleted: deletedShiftOrders.length,
        swapRequestsDeleted: deletedSwapRequests.length,
        scheduledBreaksDeleted: deletedScheduledBreaks.length,
        shiftActionsDeleted: deletedShiftActions.length,
        trainingDataDeleted: deletedTrainingAttempts.length + deletedTrainingRuns.length + deletedTrainingScenarios.length,
      };
    });

    log.info(`[ClearSchedule] Complete:`, summary);

    const protectedDetails = protectedTimeEntries.slice(0, 20).map(te => ({
      timeEntryId: te.id,
      shiftId: te.shiftId,
      reason: te.invoiceId ? `Billed (invoice ${te.invoiceId.substring(0, 12)}...)` : `Payrolled (run ${te.payrollRunId?.substring(0, 12)}...)`,
    }));

    res.json({
      success: true,
      ...summary,
      message: `Cleared ${summary.shiftsDeleted} shifts and ${summary.timeEntriesDeleted} time entries. Protected ${summary.shiftsProtected} shifts and ${summary.timeEntriesProtected} time entries with financial links.`,
      protectedRecords: protectedDetails,
    });
  } catch (error: unknown) {
    log.error("[ClearSchedule] Error clearing schedule:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to clear schedule data" });
  }
});

/**
 * Difficulty → scheduling constraint mapping.
 *
 * demandMultiplier: passed into generateWeeklyShifts to scale how many guards/
 *   shift windows each client gets (1.0 = baseline real demand, 4.0 = crisis).
 * maxShiftsPerEmployee: cap on how many month-shifts a single employee can be
 *   assigned — lower cap = harder resource puzzle for Trinity.
 * useContractorFallback: at easy we allow contractors as a safety net; at harder
 *   levels Trinity must solve with the real staff roster only.
 * label / demandDescription: surfaced in the API response for the front-end.
 */
const DIFFICULTY_PARAMS: Record<string, {
  demandMultiplier: number;
  maxShiftsPerEmployee: number;
  useContractorFallback: boolean;
  label: string;
  demandDescription: string;
}> = {
  easy: {
    demandMultiplier: 1.0,
    maxShiftsPerEmployee: 25,
    useContractorFallback: true,
    label: 'Easy',
    demandDescription: 'Baseline real demand — normal client coverage, full staff available',
  },
  medium: {
    demandMultiplier: 1.5,
    maxShiftsPerEmployee: 20,
    useContractorFallback: false,
    label: 'Medium',
    demandDescription: '1.5× demand — extra evening windows per client, no contractor fallback',
  },
  hard: {
    demandMultiplier: 2.0,
    maxShiftsPerEmployee: 16,
    useContractorFallback: false,
    label: 'Hard',
    demandDescription: '2× demand — evening + night shifts added, weekends required, tighter staff caps',
  },
  meta: {
    demandMultiplier: 3.0,
    maxShiftsPerEmployee: 12,
    useContractorFallback: false,
    label: 'META',
    demandDescription: '3× demand — full 7-day coverage forced for every client, resource crunch',
  },
  extreme: {
    demandMultiplier: 4.0,
    maxShiftsPerEmployee: 8,
    useContractorFallback: false,
    label: 'EXTREME',
    demandDescription: '4× demand — 24/7 three-shift cycle for all clients, near-impossible allocation',
  },
};

/**
 * POST /api/trinity-training/schedule-month
 *
 * Merged training + real-data scheduling endpoint.
 *
 * Phase 1: Generate open shifts from real Acme client contracts, scaled by
 *   the selected difficulty (demandMultiplier adjusts guards/shift and coverage
 *   windows per client — no synthetic data, all real org data).
 * Phase 2: Trinity's autonomous scheduler assigns employees subject to
 *   difficulty-mapped constraints (maxShiftsPerEmployee, contractorFallback).
 *
 * No new orchestrator — still gluing generateWeeklyShifts + executeAutonomousScheduling.
 */
router.post('/schedule-month', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "No workspace selected" });

    await guardAgainstProduction(workspaceId, 'training/schedule-month');

    const fillOnly = req.body?.fillOnly === true || req.query?.fillOnly === 'true';
    const rawDifficulty = (req.body?.difficulty as string || 'easy').toLowerCase();
    const params = DIFFICULTY_PARAMS[rawDifficulty] ?? DIFFICULTY_PARAMS.easy;

    const { trinityAutonomousScheduler } = await import('../services/scheduling/trinityAutonomousScheduler');

    let totalShiftsCreated = 0;

    if (!fillOnly) {
      const { generateWeeklyShifts } = await import('../services/scheduling/trinityShiftGenerator');

      const targetMonthStr = req.body?.targetMonth as string | undefined;
      const targetMonth = targetMonthStr ? new Date(targetMonthStr) : new Date();
      const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      const monthEnd   = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

      const now = new Date();
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      currentWeekStart.setHours(0, 0, 0, 0);

      const seenOffsets = new Set<number>();
      const weekOffsets: number[] = [];
      const cursor = new Date(monthStart);
      while (cursor <= monthEnd) {
        const ws = new Date(cursor);
        ws.setDate(cursor.getDate() - (cursor.getDay() === 0 ? 6 : cursor.getDay() - 1));
        ws.setHours(0, 0, 0, 0);
        const offset = Math.round((ws.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (!seenOffsets.has(offset)) {
          seenOffsets.add(offset);
          weekOffsets.push(offset);
        }
        cursor.setDate(cursor.getDate() + 7);
      }
      weekOffsets.sort((a, b) => a - b);

      log.info(`[ScheduleMonth] difficulty=${params.label} | ${weekOffsets.length} weeks (offsets: ${weekOffsets.join(', ')})`);

      for (const offset of weekOffsets) {
        const result = await generateWeeklyShifts(workspaceId, offset);
        totalShiftsCreated += result.shiftsCreated;
        log.info(`[ScheduleMonth] Week offset ${offset}: created ${result.shiftsCreated} shifts`);
      }

      log.info(`[ScheduleMonth] ${totalShiftsCreated} open shifts generated — handing off to autonomous scheduler`);
    } else {
      // CATEGORY C — Raw SQL retained: Count( | Tables:  | Verified: 2026-03-23
      const openCount = await typedCount(
        sql`SELECT COUNT(*) as count FROM ${shifts} WHERE workspace_id = ${workspaceId} AND status = 'draft' AND employee_id IS NULL`
      );
      log.info(`[ScheduleMonth] fillOnly=true — skipping shift generation. ${openCount} open shifts to fill.`);
    }

    const schedResult = await trinityAutonomousScheduler.executeAutonomousScheduling({
      workspaceId,
      userId,
      mode: 'full_month',
      prioritizeBy: fillOnly ? 'urgency' : 'chronological',
      useContractorFallback: params.useContractorFallback,
      maxShiftsPerEmployee: params.maxShiftsPerEmployee,
      respectAvailability: true,
    });

    res.json({
      success: true,
      fillOnly,
      difficulty: params.label,
      demandDescription: params.demandDescription,
      message: fillOnly
        ? `Trinity filled ${schedResult.summary.totalAssigned} of ${schedResult.summary.totalProcessed} open shifts. ${schedResult.summary.totalFailed} unfilled.`
        : `[${params.label}] Generated ${totalShiftsCreated} real-org shifts. Trinity assigned ${schedResult.summary.totalAssigned} of ${schedResult.summary.totalProcessed}.`,
      shiftsGenerated: totalShiftsCreated,
      assigned: schedResult.summary.totalAssigned,
      processed: schedResult.summary.totalProcessed,
      failed: schedResult.summary.totalFailed,
      sessionId: schedResult.session.sessionId,
    });
  } catch (error: unknown) {
    log.error("[ScheduleMonth] Error:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to schedule month" });
  }
});

export default router;
