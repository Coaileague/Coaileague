/**
 * ASSETOS™ - DUAL-LAYER RESOURCE SCHEDULING
 * 
 * Extends AI Scheduling™ to schedule physical resources alongside people.
 * Real-time conflict detection prevents double-booking expensive equipment.
 */

import { storage } from "../storage";

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Check for asset scheduling conflicts
 */
export async function checkAssetConflicts(
  assetId: string,
  startTime: Date,
  endTime: Date,
  workspaceId: string,
  excludeScheduleId?: string
): Promise<{
  hasConflict: boolean;
  conflicts: any[];
}> {
  const existingSchedules = await storage.getAssetSchedulesByAsset(
    assetId,
    workspaceId,
    startTime,
    endTime
  );

  // Filter out the schedule being edited (if any)
  const conflicts = existingSchedules.filter((schedule: any) => {
    if (excludeScheduleId && schedule.id === excludeScheduleId) {
      return false;
    }

    // Check if cancelled
    if (schedule.status === 'cancelled') {
      return false;
    }

    // Check time overlap
    const scheduleStart = new Date(schedule.startTime);
    const scheduleEnd = new Date(schedule.endTime);

    return (
      (startTime >= scheduleStart && startTime < scheduleEnd) ||
      (endTime > scheduleStart && endTime <= scheduleEnd) ||
      (startTime <= scheduleStart && endTime >= scheduleEnd)
    );
  });

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Schedule asset for a shift (dual-layer scheduling)
 */
export async function scheduleAssetWithShift(params: {
  workspaceId: string;
  assetId: string;
  shiftId: string;
  employeeId: string;
  clientId?: string;
  jobDescription?: string;
  jobLocation?: string;
  createdBy: string;
}): Promise<any> {
  const { workspaceId, assetId, shiftId, employeeId, clientId, jobDescription, jobLocation, createdBy } = params;

  // Get shift details
  const shift = await storage.getShift(shiftId, workspaceId);
  if (!shift) {
    throw new Error('Shift not found');
  }

  const startTime = new Date(shift.startTime);
  const endTime = new Date(shift.endTime);

  // Check asset availability
  const asset = await storage.getAsset(assetId, workspaceId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  if (!asset.isSchedulable || asset.status !== 'available') {
    throw new Error(`Asset ${asset.assetName} is not available for scheduling`);
  }

  // Check for conflicts
  const conflictCheck = await checkAssetConflicts(assetId, startTime, endTime, workspaceId);
  if (conflictCheck.hasConflict) {
    throw new Error(`Asset ${asset.assetName} has scheduling conflicts: ${conflictCheck.conflicts.map((c: any) => c.id).join(', ')}`);
  }

  // Verify employee has required certifications
  if (asset.requiresOperatorCertification) {
    const employee = await storage.getEmployee(employeeId, workspaceId);
    const employeeCerts = (employee?.certifications as string[]) || [];
    const requiredCerts = (asset.requiredCertifications as string[]) || [];

    const hasAllCerts = requiredCerts.every(required =>
      employeeCerts.some(cert =>
        cert.toLowerCase().includes(required.toLowerCase()) ||
        required.toLowerCase().includes(cert.toLowerCase())
      )
    );

    if (!hasAllCerts) {
      throw new Error(`Employee does not have required certifications for ${asset.assetName}: ${requiredCerts.join(', ')}`);
    }
  }

  // Create asset schedule
  const schedule = await storage.createAssetSchedule({
    workspaceId,
    assetId,
    shiftId,
    employeeId,
    clientId,
    startTime,
    endTime,
    jobDescription,
    jobLocation,
    hourlyRate: asset.hourlyRate?.toString(),
    hasConflict: false,
    conflictWith: [],
    status: 'scheduled',
    createdBy,
  });

  // Update asset status
  await storage.updateAsset(assetId, workspaceId, {
    status: 'in_use',
  });

  return schedule;
}

/**
 * Complete asset schedule and calculate billable time
 */
export async function completeAssetSchedule(
  scheduleId: string,
  workspaceId: string,
  completionData: {
    actualStartTime?: Date;
    actualEndTime?: Date;
    odometerStart?: number;
    odometerEnd?: number;
    fuelUsed?: number;
    preInspectionCompleted?: boolean;
    preInspectionNotes?: string;
    postInspectionCompleted?: boolean;
    postInspectionNotes?: string;
    damageReported?: boolean;
    damageDescription?: string;
    completedBy: string;
  }
): Promise<any> {
  const schedule = await storage.getAssetSchedule(scheduleId, workspaceId);
  if (!schedule) {
    throw new Error('Asset schedule not found');
  }

  // Calculate actual hours
  const actualStart = completionData.actualStartTime || new Date(schedule.startTime);
  const actualEnd = completionData.actualEndTime || new Date(schedule.endTime);
  const actualHours = (actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60);

  // Calculate billable amount
  const hourlyRate = parseFloat(schedule.hourlyRate?.toString() || '0');
  const billableHours = actualHours;
  const totalCharge = billableHours * hourlyRate;

  // Update schedule
  const updated = await storage.updateAssetSchedule(scheduleId, workspaceId, {
    actualStartTime: actualStart,
    actualEndTime: actualEnd,
    actualHours: actualHours.toFixed(2),
    billableHours: billableHours.toFixed(2),
    totalCharge: totalCharge.toFixed(2),
    odometerStart: completionData.odometerStart?.toString(),
    odometerEnd: completionData.odometerEnd?.toString(),
    fuelUsed: completionData.fuelUsed?.toString(),
    preInspectionCompleted: completionData.preInspectionCompleted,
    preInspectionBy: completionData.preInspectionCompleted ? completionData.completedBy : undefined,
    preInspectionNotes: completionData.preInspectionNotes,
    postInspectionCompleted: completionData.postInspectionCompleted,
    postInspectionBy: completionData.postInspectionCompleted ? completionData.completedBy : undefined,
    postInspectionNotes: completionData.postInspectionNotes,
    damageReported: completionData.damageReported,
    damageDescription: completionData.damageDescription,
    status: 'completed',
  });

  // Create usage log
  await createAssetUsageLog(schedule, actualStart, actualEnd, actualHours, totalCharge);

  // Update asset status back to available
  await storage.updateAsset(schedule.assetId, workspaceId, {
    status: 'available',
  });

  // If damage reported, flag asset for maintenance
  if (completionData.damageReported) {
    await storage.updateAsset(schedule.assetId, workspaceId, {
      status: 'maintenance',
    });
  }

  return updated;
}

/**
 * Create asset usage log for Billing Platform integration
 */
async function createAssetUsageLog(
  schedule: any,
  actualStart: Date,
  actualEnd: Date,
  totalHours: number,
  billableAmount: number
): Promise<void> {
  await storage.createAssetUsageLog({
    workspaceId: schedule.workspaceId,
    assetId: schedule.assetId,
    assetScheduleId: schedule.id,
    usagePeriodStart: actualStart,
    usagePeriodEnd: actualEnd,
    totalHours: totalHours.toFixed(2),
    operatedBy: schedule.employeeId,
    clientId: schedule.clientId,
    billableAmount: billableAmount.toFixed(2),
    totalDistance: schedule.odometerEnd && schedule.odometerStart
      ? (parseFloat(schedule.odometerEnd) - parseFloat(schedule.odometerStart)).toFixed(2)
      : undefined,
    fuelConsumed: schedule.fuelUsed?.toString(),
    billingStatus: 'pending',
  });
}

// ============================================================================
// MAINTENANCE TRACKING
// ============================================================================

/**
 * Check if asset is due for maintenance
 */
export async function checkMaintenanceDue(
  assetId: string,
  workspaceId: string
): Promise<{
  isDue: boolean;
  daysOverdue?: number;
  nextMaintenanceDate?: Date;
}> {
  const asset = await storage.getAsset(assetId, workspaceId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  if (!asset.nextMaintenanceDate) {
    return {
      isDue: false,
    };
  }

  const nextMaintenance = new Date(asset.nextMaintenanceDate);
  const now = new Date();

  if (now >= nextMaintenance) {
    const daysOverdue = Math.floor((now.getTime() - nextMaintenance.getTime()) / (1000 * 60 * 60 * 24));
    return {
      isDue: true,
      daysOverdue,
      nextMaintenanceDate: nextMaintenance,
    };
  }

  return {
    isDue: false,
    nextMaintenanceDate: nextMaintenance,
  };
}

/**
 * Schedule maintenance for asset
 */
export async function scheduleAssetMaintenance(
  assetId: string,
  workspaceId: string,
  maintenanceData: {
    scheduledDate: Date;
    estimatedDuration: number; // hours
    notes?: string;
    scheduledBy: string;
  }
): Promise<void> {
  const asset = await storage.getAsset(assetId, workspaceId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  // Update asset status
  await storage.updateAsset(assetId, workspaceId, {
    status: 'maintenance',
    isSchedulable: false,
  });

  // Create audit log
  await storage.createAuditLog({
    workspaceId,
    userId: maintenanceData.scheduledBy,
    userName: 'System',
    userRole: 'manager',
    action: 'schedule_maintenance',
    entityType: 'asset',
    entityId: assetId,
    entityDescription: `Scheduled maintenance for ${asset.assetName}`,
    metadata: {
      scheduledDate: maintenanceData.scheduledDate,
      estimatedDuration: maintenanceData.estimatedDuration,
      notes: maintenanceData.notes,
    },
  });
}

/**
 * Complete maintenance and return asset to service
 */
export async function completeAssetMaintenance(
  assetId: string,
  workspaceId: string,
  maintenanceData: {
    completedDate: Date;
    workPerformed: string;
    nextMaintenanceInterval?: number; // days
    completedBy: string;
  }
): Promise<void> {
  const asset = await storage.getAsset(assetId, workspaceId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  // Calculate next maintenance date
  const nextMaintenanceDate = new Date(maintenanceData.completedDate);
  const intervalDays = maintenanceData.nextMaintenanceInterval || asset.maintenanceIntervalDays || 90;
  nextMaintenanceDate.setDate(nextMaintenanceDate.getDate() + intervalDays);

  // Update asset
  await storage.updateAsset(assetId, workspaceId, {
    status: 'available',
    isSchedulable: true,
    lastMaintenanceDate: maintenanceData.completedDate,
    nextMaintenanceDate,
    maintenanceIntervalDays: intervalDays,
  });

  // Create audit log
  await storage.createAuditLog({
    workspaceId,
    userId: maintenanceData.completedBy,
    userName: 'System',
    userRole: 'manager',
    action: 'complete_maintenance',
    entityType: 'asset',
    entityId: assetId,
    entityDescription: `Completed maintenance for ${asset.assetName}`,
    metadata: {
      completedDate: maintenanceData.completedDate,
      workPerformed: maintenanceData.workPerformed,
      nextMaintenanceDate,
    },
  });
}

// ============================================================================
// ASSET UTILIZATION ANALYTICS
// ============================================================================

/**
 * Calculate asset utilization rate
 */
export async function calculateAssetUtilization(
  assetId: string,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  utilizationRate: number;
  totalScheduledHours: number;
  totalAvailableHours: number;
  revenue: number;
  scheduleCount: number;
}> {
  const schedules = await storage.getAssetSchedulesByAssetAndDateRange(
    assetId,
    workspaceId,
    periodStart,
    periodEnd
  );

  const completedSchedules = schedules.filter((s: any) => s.status === 'completed');

  const totalScheduledHours = completedSchedules.reduce((sum: number, s: any) => {
    const hours = parseFloat(s.actualHours?.toString() || s.billableHours?.toString() || '0');
    return sum + hours;
  }, 0);

  const revenue = completedSchedules.reduce((sum: number, s: any) => {
    const charge = parseFloat(s.totalCharge?.toString() || '0');
    return sum + charge;
  }, 0);

  // Calculate available hours (24/7 minus maintenance time)
  const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
  const totalAvailableHours = periodDays * 24; // Assume 24/7 availability

  const utilizationRate = totalAvailableHours > 0
    ? (totalScheduledHours / totalAvailableHours) * 100
    : 0;

  return {
    utilizationRate,
    totalScheduledHours,
    totalAvailableHours,
    revenue,
    scheduleCount: completedSchedules.length,
  };
}
