import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { 
  scheduleSnapshots,
  publishedSchedules,
  shifts,
  employees,
  type Shift,
  type ScheduleSnapshot,
  type InsertScheduleSnapshot
} from "@shared/schema";
import { pushNotificationService } from "./pushNotificationService";
import { createAuditLogFromContext } from "../middleware/audit";
import { createLogger } from '../lib/logger';
const log = createLogger('scheduleRollbackService');


interface RollbackResult {
  success: boolean;
  message: string;
  affectedEmployees?: number;
  restoredShifts?: number;
  snapshotId?: string;
  error?: string;
}

interface ShiftSnapshotData {
  id: string;
  employeeId: string | null;
  clientId: string | null;
  title: string | null;
  startTime: string;
  endTime: string;
  status: string;
  aiGenerated: boolean | null;
  aiConfidenceScore: string | null;
  riskScore: string | null;
  riskFactors: string[] | null;
}

export async function createScheduleSnapshot(
  workspaceId: string,
  publishedScheduleId: string,
  shiftIds: string[]
): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
  try {
    const shiftsData = await db.query.shifts.findMany({
      where: and(
        eq(shifts.workspaceId, workspaceId),
      ),
    });

    const relevantShifts = shiftsData.filter(s => shiftIds.includes(s.id));
    
    const snapshotData: ShiftSnapshotData[] = relevantShifts.map(shift => ({
      id: shift.id,
      employeeId: shift.employeeId,
      clientId: shift.clientId,
      title: shift.title,
      startTime: shift.startTime.toISOString(),
      endTime: shift.endTime.toISOString(),
      status: shift.status || 'draft',
      aiGenerated: shift.aiGenerated,
      aiConfidenceScore: shift.aiConfidenceScore,
      riskScore: shift.riskScore,
      riskFactors: shift.riskFactors as string[] | null,
    }));

    const uniqueEmployees = new Set(relevantShifts.map(s => s.employeeId).filter(Boolean));

    const [snapshot] = await db.insert(scheduleSnapshots).values({
      workspaceId,
      publishedScheduleId,
      snapshotData: snapshotData,
      shiftCount: relevantShifts.length,
      employeesAffected: uniqueEmployees.size,
    }).returning();

    log.info(`[ScheduleRollback] Created snapshot ${snapshot.id} for ${relevantShifts.length} shifts`);
    
    return { success: true, snapshotId: snapshot.id };
  } catch (error) {
    log.error('[ScheduleRollback] Failed to create snapshot:', error);
    return { success: false, error: String(error) };
  }
}

export async function rollbackSchedule(
  workspaceId: string,
  publishedScheduleId: string,
  userId: string,
  reason: string,
  notifyEmployees: boolean = true
): Promise<RollbackResult> {
  try {
    const snapshot = await db.query.scheduleSnapshots.findFirst({
      where: and(
        eq(scheduleSnapshots.publishedScheduleId, publishedScheduleId),
        eq(scheduleSnapshots.workspaceId, workspaceId),
        eq(scheduleSnapshots.isRolledBack, false)
      ),
      orderBy: [desc(scheduleSnapshots.createdAt)],
    });

    if (!snapshot) {
      return { 
        success: false, 
        message: 'No snapshot available for rollback',
        error: 'SNAPSHOT_NOT_FOUND'
      };
    }

    const snapshotData = snapshot.snapshotData as ShiftSnapshotData[];
    
    if (!Array.isArray(snapshotData) || snapshotData.length === 0) {
      return {
        success: false,
        message: 'Snapshot data is empty or invalid',
        error: 'INVALID_SNAPSHOT_DATA'
      };
    }

    const affectedEmployeeIds = new Set<string>();
    let restoredCount = 0;

    for (const shiftData of snapshotData) {
      try {
        await db.update(shifts)
          .set({
            employeeId: shiftData.employeeId,
            status: shiftData.status as any,
            updatedAt: new Date(),
          })
          .where(eq(shifts.id, shiftData.id));
        
        if (shiftData.employeeId) {
          affectedEmployeeIds.add(shiftData.employeeId);
        }
        restoredCount++;
      } catch (err) {
        log.warn(`[ScheduleRollback] Failed to restore shift ${shiftData.id}:`, err);
      }
    }

    await db.update(scheduleSnapshots)
      .set({
        isRolledBack: true,
        rolledBackAt: new Date(),
        rolledBackBy: userId,
        rollbackReason: reason,
      })
      .where(eq(scheduleSnapshots.id, snapshot.id));

    if (notifyEmployees && affectedEmployeeIds.size > 0) {
      const employeeList = await db.query.employees.findMany({
        where: eq(employees.workspaceId, workspaceId),
        with: {
          user: true,
        },
      });

      const affectedEmployees = employeeList.filter(e => 
        affectedEmployeeIds.has(e.id) && e.userId
      );

      for (const employee of affectedEmployees) {
        if (employee.userId) {
          try {
            await (pushNotificationService as any).sendToUser(employee.userId, {
              title: 'Schedule Update',
              body: 'Your shift schedule has been updated. Please check the app for details.',
              data: { type: 'schedule_rollback', publishedScheduleId },
            });
          } catch (err) {
            log.warn(`[ScheduleRollback] Failed to notify employee ${employee.id}:`, err);
          }
        }
      }
    }

    await createAuditLogFromContext(
      {
        workspaceId,
        userId,
        userEmail: 'system',
        userRole: 'org_owner',
      },
      'update',
      'published_schedule',
      publishedScheduleId,
      {
        action: 'schedule.rollback',
        snapshotId: snapshot.id,
        reason,
        affectedEmployees: affectedEmployeeIds.size,
        restoredShifts: restoredCount,
        notificationsSent: notifyEmployees,
      }
    );

    log.info(`[ScheduleRollback] Successfully rolled back schedule ${publishedScheduleId}, restored ${restoredCount} shifts, notified ${affectedEmployeeIds.size} employees`);

    return {
      success: true,
      message: `Schedule rolled back successfully. ${restoredCount} shifts restored.`,
      affectedEmployees: affectedEmployeeIds.size,
      restoredShifts: restoredCount,
      snapshotId: snapshot.id,
    };
  } catch (error) {
    log.error('[ScheduleRollback] Rollback failed:', error);
    return {
      success: false,
      message: 'Failed to rollback schedule',
      error: String(error),
    };
  }
}

export async function getScheduleSnapshots(
  workspaceId: string,
  publishedScheduleId?: string
): Promise<ScheduleSnapshot[]> {
  if (publishedScheduleId) {
    return db.query.scheduleSnapshots.findMany({
      where: and(
        eq(scheduleSnapshots.workspaceId, workspaceId),
        eq(scheduleSnapshots.publishedScheduleId, publishedScheduleId)
      ),
      orderBy: [desc(scheduleSnapshots.createdAt)],
    });
  }
  
  return db.query.scheduleSnapshots.findMany({
    where: eq(scheduleSnapshots.workspaceId, workspaceId),
    orderBy: [desc(scheduleSnapshots.createdAt)],
    limit: 50,
  });
}

export const scheduleRollbackService = {
  createSnapshot: createScheduleSnapshot,
  rollback: rollbackSchedule,
  getSnapshots: getScheduleSnapshots,
};
