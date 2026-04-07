import { BaseSkill } from './base-skill';
import type {
  SkillManifest,
  SkillContext,
  SkillResult,
} from './types';
import { db } from '../../../db';
import { timeEntries, employees } from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { subDays, startOfWeek, endOfWeek, differenceInHours, differenceInMinutes, format } from 'date-fns';

import { createLogger } from '../../../lib/logger';
import { PLATFORM } from '../../../config/platformConfig';
const log = createLogger('timeAnomalyDetection');

interface TimeAnomalyInput {
  action: 'clock_in' | 'clock_out' | 'analyze_patterns';
  employeeId: string;
  employeeName: string;
  timeEntryId?: string;
  clockInTime?: string;
  clockOutTime?: string;
  totalHours?: number;
  shiftDurationMinutes?: number;
  isOvertime?: boolean;
  isExtendedShift?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  dayOfWeek?: number;
  hourOfDay?: number;
  shiftId?: string | null;
  analysisType?: 'weekly' | 'monthly' | 'custom';
  startDate?: string;
  endDate?: string;
}

interface AnomalyAlert {
  type: 'overtime' | 'extended_shift' | 'unusual_time' | 'location_deviation' | 'pattern_change' | 'missing_break';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
}

interface TimeAnomalyResult {
  employeeId: string;
  employeeName: string;
  alerts: AnomalyAlert[];
  patterns: {
    averageClockInHour: number;
    averageClockOutHour: number;
    averageShiftDuration: number;
    weeklyHours: number;
    overtimeHoursThisWeek: number;
    mostCommonDays: number[];
    attendanceStreak: number;
  };
  recommendations: string[];
  analyzedAt: Date;
}

const OVERTIME_THRESHOLD_HOURS = 8;
const EXTENDED_SHIFT_THRESHOLD_HOURS = 10;
const WEEKLY_OVERTIME_THRESHOLD = 40;
const UNUSUAL_CLOCK_IN_BEFORE = 5; // 5 AM
const UNUSUAL_CLOCK_OUT_AFTER = 22; // 10 PM
const REQUIRED_BREAK_AFTER_HOURS = 6;

export class TimeAnomalyDetectionSkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'time_anomaly_detection',
      name: 'Time Anomaly Detection',
      version: '1.0.0',
      description: 'AI-powered detection of unusual time tracking patterns including overtime alerts, schedule deviations, and compliance issues',
      author: PLATFORM.name + " Platform",
      category: 'compliance',
      requiredTier: 'starter',
      capabilities: [
        'overtime-detection',
        'pattern-analysis',
        'compliance-monitoring',
        'alert-generation',
        'attendance-tracking',
      ],
      dependencies: [],
      apiEndpoints: ['/api/ai-brain/skills/time-anomaly-detection/execute'],
      eventSubscriptions: ['time.clock_in', 'time.clock_out', 'time.entry.approved'],
    };
  }

  async execute(
    context: SkillContext,
    params: TimeAnomalyInput
  ): Promise<SkillResult<TimeAnomalyResult>> {
    const logs: string[] = [];
    const startTime = Date.now();
    logs.push(`[TimeAnomalyDetection] Processing ${params.action} for employee ${params.employeeName}`);

    try {
      const alerts: AnomalyAlert[] = [];
      const recommendations: string[] = [];

      if (params.action === 'clock_in') {
        const clockInAlerts = await this.analyzeClockIn(context, params, logs);
        alerts.push(...clockInAlerts);
      } else if (params.action === 'clock_out') {
        const clockOutAlerts = await this.analyzeClockOut(context, params, logs);
        alerts.push(...clockOutAlerts);
      } else if (params.action === 'analyze_patterns') {
        const patternAlerts = await this.analyzePatterns(context, params, logs);
        alerts.push(...patternAlerts);
      }

      const patterns = await this.calculateEmployeePatterns(context, params.employeeId);
      logs.push(`[TimeAnomalyDetection] Pattern analysis complete: ${patterns.weeklyHours.toFixed(1)} hrs this week`);

      if (patterns.overtimeHoursThisWeek > 0) {
        recommendations.push(`Employee has ${patterns.overtimeHoursThisWeek.toFixed(1)} overtime hours this week. Consider workload balancing.`);
      }

      if (patterns.weeklyHours > WEEKLY_OVERTIME_THRESHOLD) {
        alerts.push({
          type: 'overtime',
          severity: 'warning',
          message: `Weekly hours (${patterns.weeklyHours.toFixed(1)}) exceed ${WEEKLY_OVERTIME_THRESHOLD} hour threshold`,
          details: { weeklyHours: patterns.weeklyHours, threshold: WEEKLY_OVERTIME_THRESHOLD },
          timestamp: new Date(),
        });
        recommendations.push('Review scheduling to prevent burnout and ensure labor law compliance.');
      }

      if (patterns.attendanceStreak >= 7) {
        recommendations.push(`Great attendance! ${patterns.attendanceStreak} consecutive days worked.`);
      }

      const result: TimeAnomalyResult = {
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        alerts,
        patterns,
        recommendations,
        analyzedAt: new Date(),
      };

      logs.push(`[TimeAnomalyDetection] Analysis complete: ${alerts.length} alerts, ${recommendations.length} recommendations`);

      return {
        success: true,
        data: result,
        logs,
        metadata: {
          alertCount: alerts.length,
          recommendationCount: recommendations.length,
          processingTimeMs: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      logs.push(`[TimeAnomalyDetection] Error: ${(error instanceof Error ? error.message : String(error))}`);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to analyze time patterns',
        logs,
      };
    }
  }

  private async analyzeClockIn(
    context: SkillContext,
    params: TimeAnomalyInput,
    logs: string[]
  ): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    const hourOfDay = params.hourOfDay || new Date(params.clockInTime || '').getHours();

    if (hourOfDay < UNUSUAL_CLOCK_IN_BEFORE) {
      alerts.push({
        type: 'unusual_time',
        severity: 'info',
        message: `Early clock-in detected at ${hourOfDay}:00 (before ${UNUSUAL_CLOCK_IN_BEFORE}:00 AM)`,
        details: { hourOfDay, threshold: UNUSUAL_CLOCK_IN_BEFORE },
        timestamp: new Date(),
      });
      logs.push(`[TimeAnomalyDetection] Early clock-in alert generated`);
    }

    const patterns = await this.calculateEmployeePatterns(context, params.employeeId);
    const avgClockIn = patterns.averageClockInHour;
    const deviation = Math.abs(hourOfDay - avgClockIn);

    if (deviation > 3 && patterns.weeklyHours > 8) {
      alerts.push({
        type: 'pattern_change',
        severity: 'info',
        message: `Clock-in time (${hourOfDay}:00) differs significantly from average (${avgClockIn.toFixed(0)}:00)`,
        details: { actualHour: hourOfDay, averageHour: avgClockIn, deviation },
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  private async analyzeClockOut(
    context: SkillContext,
    params: TimeAnomalyInput,
    logs: string[]
  ): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    const hourOfDay = params.hourOfDay || new Date(params.clockOutTime || '').getHours();
    const totalHours = params.totalHours || 0;

    if (params.isExtendedShift) {
      alerts.push({
        type: 'extended_shift',
        severity: 'warning',
        message: `Extended shift detected: ${totalHours.toFixed(1)} hours (exceeds ${EXTENDED_SHIFT_THRESHOLD_HOURS} hour limit)`,
        details: { 
          totalHours, 
          threshold: EXTENDED_SHIFT_THRESHOLD_HOURS,
          clockIn: params.clockInTime,
          clockOut: params.clockOutTime,
        },
        timestamp: new Date(),
      });
      logs.push(`[TimeAnomalyDetection] Extended shift alert (${totalHours.toFixed(1)} hrs)`);
    } else if (params.isOvertime) {
      alerts.push({
        type: 'overtime',
        severity: 'info',
        message: `Overtime recorded: ${totalHours.toFixed(1)} hours (${(totalHours - OVERTIME_THRESHOLD_HOURS).toFixed(1)} hrs OT)`,
        details: { 
          totalHours, 
          overtimeHours: totalHours - OVERTIME_THRESHOLD_HOURS,
          threshold: OVERTIME_THRESHOLD_HOURS,
        },
        timestamp: new Date(),
      });
      logs.push(`[TimeAnomalyDetection] Overtime alert (${totalHours.toFixed(1)} hrs)`);
    }

    if (hourOfDay > UNUSUAL_CLOCK_OUT_AFTER) {
      alerts.push({
        type: 'unusual_time',
        severity: 'warning',
        message: `Late clock-out detected at ${hourOfDay}:00 (after ${UNUSUAL_CLOCK_OUT_AFTER}:00)`,
        details: { hourOfDay, threshold: UNUSUAL_CLOCK_OUT_AFTER },
        timestamp: new Date(),
      });
    }

    if (totalHours >= REQUIRED_BREAK_AFTER_HOURS) {
      const hasBreak = await this.checkForBreaks(context, params.timeEntryId);
      if (!hasBreak) {
        alerts.push({
          type: 'missing_break',
          severity: 'warning',
          message: `No break recorded for ${totalHours.toFixed(1)} hour shift (breaks required after ${REQUIRED_BREAK_AFTER_HOURS} hours)`,
          details: { totalHours, requiredAfterHours: REQUIRED_BREAK_AFTER_HOURS },
          timestamp: new Date(),
        });
        logs.push(`[TimeAnomalyDetection] Missing break alert`);
      }
    }

    return alerts;
  }

  private async analyzePatterns(
    context: SkillContext,
    params: TimeAnomalyInput,
    logs: string[]
  ): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    
    const startDate = params.startDate ? new Date(params.startDate) : startOfWeek(new Date());
    const endDate = params.endDate ? new Date(params.endDate) : endOfWeek(new Date());

    const entries = await db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.employeeId, params.employeeId),
        eq(timeEntries.workspaceId, context.workspaceId),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate)
      ),
      orderBy: [desc(timeEntries.clockIn)],
    });

    logs.push(`[TimeAnomalyDetection] Analyzing ${entries.length} entries from ${format(startDate, 'MMM d')} to ${format(endDate, 'MMM d')}`);

    let consecutiveLongDays = 0;
    for (const entry of entries) {
      if (entry.totalHours && parseFloat(entry.totalHours.toString()) > OVERTIME_THRESHOLD_HOURS) {
        consecutiveLongDays++;
      } else {
        consecutiveLongDays = 0;
      }
    }

    if (consecutiveLongDays >= 3) {
      alerts.push({
        type: 'pattern_change',
        severity: 'critical',
        message: `Employee has worked ${consecutiveLongDays} consecutive days with overtime. Burnout risk detected.`,
        details: { consecutiveLongDays, threshold: 3 },
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  private async calculateEmployeePatterns(
    context: SkillContext,
    employeeId: string
  ): Promise<TimeAnomalyResult['patterns']> {
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const monthAgo = subDays(new Date(), 30);

    const recentEntries = await db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.workspaceId, context.workspaceId),
        gte(timeEntries.clockIn, monthAgo)
      ),
      orderBy: [desc(timeEntries.clockIn)],
    });

    const weeklyEntries = recentEntries.filter(e => 
      new Date(e.clockIn) >= weekStart && new Date(e.clockIn) <= weekEnd
    );

    let totalClockInHours = 0;
    let totalClockOutHours = 0;
    let totalDuration = 0;
    let weeklyHours = 0;
    const daysWorked: number[] = [];

    for (const entry of recentEntries) {
      const clockIn = new Date(entry.clockIn);
      totalClockInHours += clockIn.getHours();
      
      if (entry.clockOut) {
        const clockOut = new Date(entry.clockOut);
        totalClockOutHours += clockOut.getHours();
      }
      
      if (entry.totalHours) {
        totalDuration += parseFloat(entry.totalHours.toString());
      }

      const day = clockIn.getDay();
      if (!daysWorked.includes(day)) {
        daysWorked.push(day);
      }
    }

    for (const entry of weeklyEntries) {
      if (entry.totalHours) {
        weeklyHours += parseFloat(entry.totalHours.toString());
      }
    }

    const entryCount = recentEntries.length || 1;
    const averageClockInHour = totalClockInHours / entryCount;
    const averageClockOutHour = totalClockOutHours / entryCount;
    const averageShiftDuration = totalDuration / entryCount;
    const overtimeHoursThisWeek = Math.max(0, weeklyHours - WEEKLY_OVERTIME_THRESHOLD);

    let attendanceStreak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const checkDate = subDays(today, i);
      const hasEntry = recentEntries.some(e => {
        const entryDate = new Date(e.clockIn);
        return entryDate.toDateString() === checkDate.toDateString();
      });
      if (hasEntry) {
        attendanceStreak++;
      } else if (i > 0) {
        break;
      }
    }

    return {
      averageClockInHour,
      averageClockOutHour,
      averageShiftDuration,
      weeklyHours,
      overtimeHoursThisWeek,
      mostCommonDays: daysWorked.sort((a, b) => a - b),
      attendanceStreak,
    };
  }

  private async checkForBreaks(
    context: SkillContext,
    timeEntryId?: string
  ): Promise<boolean> {
    if (!timeEntryId) return false;

    const { timeEntryBreaks } = await import('@shared/schema');
    const breaks = await db.query.timeEntryBreaks.findMany({
      where: eq(timeEntryBreaks.timeEntryId, timeEntryId),
    });

    return breaks.length > 0;
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return {
      healthy: this.config.enabled,
      details: {
        skillId: this.getManifest().id,
        version: this.getManifest().version,
        thresholds: {
          overtimeHours: OVERTIME_THRESHOLD_HOURS,
          extendedShiftHours: EXTENDED_SHIFT_THRESHOLD_HOURS,
          weeklyOvertimeHours: WEEKLY_OVERTIME_THRESHOLD,
        },
      },
    };
  }

  async getStats(): Promise<Record<string, any>> {
    return {
      ...await super.getStats(),
      thresholds: {
        overtimeHours: OVERTIME_THRESHOLD_HOURS,
        extendedShiftHours: EXTENDED_SHIFT_THRESHOLD_HOURS,
        weeklyOvertimeHours: WEEKLY_OVERTIME_THRESHOLD,
        unusualClockInBefore: UNUSUAL_CLOCK_IN_BEFORE,
        unusualClockOutAfter: UNUSUAL_CLOCK_OUT_AFTER,
      },
    };
  }
}

export default TimeAnomalyDetectionSkill;
