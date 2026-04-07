/**
 * Trinity Maintenance Orchestrator
 * ==================================
 * Autonomous maintenance mode scheduling and management.
 * 
 * Features:
 * - Automatic MM activation during low-traffic windows
 * - Downtime estimation based on issue severity
 * - Crawler-triggered MM activation
 * - Integration with Trinity Triad diagnostics
 */

import { maintenanceModeService, MaintenanceWindow } from './maintenanceModeService';
import { trinityRuntimeFlagsService } from './featureFlagsService';
import { createLogger } from '../lib/logger';
const log = createLogger('trinityMaintenanceOrchestrator');


export interface DiagnosticsReport {
  runId: string;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  totalIssues: number;
  estimatedFixTimeMinutes: number;
  requiresDowntime: boolean;
  affectedSystems: string[];
}

export interface MaintenanceSchedule {
  preferredWindows: { 
    dayOfWeek: number; // 0-6 (Sunday-Saturday)
    startHourUTC: number;
    endHourUTC: number;
  }[];
  maxDurationMinutes: number;
  autoActivateEnabled: boolean;
  requireApprovalForCritical: boolean;
}

const DEFAULT_SCHEDULE: MaintenanceSchedule = {
  preferredWindows: [
    { dayOfWeek: 0, startHourUTC: 2, endHourUTC: 5 }, // Sunday 2am-5am UTC
    { dayOfWeek: 1, startHourUTC: 2, endHourUTC: 4 }, // Monday 2am-4am UTC
    { dayOfWeek: 2, startHourUTC: 2, endHourUTC: 4 }, // Tuesday 2am-4am UTC
    { dayOfWeek: 3, startHourUTC: 2, endHourUTC: 4 }, // Wednesday 2am-4am UTC
    { dayOfWeek: 4, startHourUTC: 2, endHourUTC: 4 }, // Thursday 2am-4am UTC
    { dayOfWeek: 5, startHourUTC: 2, endHourUTC: 4 }, // Friday 2am-4am UTC
    { dayOfWeek: 6, startHourUTC: 2, endHourUTC: 5 }, // Saturday 2am-5am UTC
  ],
  maxDurationMinutes: 120,
  autoActivateEnabled: true,
  requireApprovalForCritical: true
};

export const trinityMaintenanceOrchestrator = {
  /**
   * Check if current time is within a maintenance window
   */
  isWithinMaintenanceWindow(schedule: MaintenanceSchedule = DEFAULT_SCHEDULE): boolean {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hourUTC = now.getUTCHours();
    
    return schedule.preferredWindows.some(window => 
      window.dayOfWeek === dayOfWeek &&
      hourUTC >= window.startHourUTC &&
      hourUTC < window.endHourUTC
    );
  },

  /**
   * Get next available maintenance window
   */
  getNextMaintenanceWindow(schedule: MaintenanceSchedule = DEFAULT_SCHEDULE): Date {
    const now = new Date();
    const currentDay = now.getUTCDay();
    const currentHour = now.getUTCHours();
    
    for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
      const targetDay = (currentDay + daysAhead) % 7;
      const window = schedule.preferredWindows.find(w => w.dayOfWeek === targetDay);
      
      if (window) {
        if (daysAhead === 0 && currentHour >= window.endHourUTC) {
          continue;
        }
        
        const nextWindow = new Date(now);
        nextWindow.setUTCDate(now.getUTCDate() + daysAhead);
        nextWindow.setUTCHours(window.startHourUTC, 0, 0, 0);
        
        if (nextWindow > now) {
          return nextWindow;
        }
      }
    }
    
    const fallback = new Date(now);
    fallback.setUTCDate(now.getUTCDate() + 1);
    fallback.setUTCHours(2, 0, 0, 0);
    return fallback;
  },

  /**
   * Estimate downtime based on diagnostics report
   */
  estimateDowntime(report: DiagnosticsReport): number {
    let minutes = 0;
    
    minutes += report.criticalIssues * 30;
    minutes += report.highIssues * 15;
    minutes += report.mediumIssues * 5;
    minutes += report.lowIssues * 2;
    
    minutes = Math.max(minutes, 15);
    minutes = Math.min(minutes, 180);
    
    return minutes;
  },

  /**
   * Determine if maintenance should be triggered based on report
   */
  shouldTriggerMaintenance(report: DiagnosticsReport): {
    should: boolean;
    reason: string;
    urgency: 'immediate' | 'scheduled' | 'none';
  } {
    if (report.criticalIssues > 0) {
      return {
        should: true,
        reason: `${report.criticalIssues} critical issues detected requiring immediate attention`,
        urgency: 'immediate'
      };
    }
    
    if (report.highIssues >= 3) {
      return {
        should: true,
        reason: `${report.highIssues} high-priority issues detected`,
        urgency: 'scheduled'
      };
    }
    
    if (report.totalIssues >= 10) {
      return {
        should: true,
        reason: `${report.totalIssues} total issues accumulated`,
        urgency: 'scheduled'
      };
    }
    
    if (report.requiresDowntime) {
      return {
        should: true,
        reason: 'Issues require system downtime for resolution',
        urgency: 'scheduled'
      };
    }
    
    return {
      should: false,
      reason: 'No maintenance required at this time',
      urgency: 'none'
    };
  },

  /**
   * Trinity-triggered maintenance activation
   */
  async triggerMaintenance(params: {
    report: DiagnosticsReport;
    immediate?: boolean;
    schedule?: MaintenanceSchedule;
  }): Promise<{
    success: boolean;
    activated: boolean;
    scheduledFor?: Date;
    message: string;
  }> {
    const { report, immediate = false, schedule = DEFAULT_SCHEDULE } = params;
    
    const currentWindow = await maintenanceModeService.getMaintenanceWindow();
    if (currentWindow.isActive) {
      return {
        success: true,
        activated: false,
        message: 'Maintenance mode is already active'
      };
    }
    
    const decision = this.shouldTriggerMaintenance(report);
    
    if (!decision.should) {
      return {
        success: true,
        activated: false,
        message: decision.reason
      };
    }
    
    const estimatedMinutes = this.estimateDowntime(report);
    
    if (immediate || decision.urgency === 'immediate') {
      const result = await maintenanceModeService.activateMaintenance({
        reason: decision.reason,
        estimatedDurationMinutes: estimatedMinutes,
        activatedBy: {
          type: 'trinity',
          id: 'trinity-orchestrator',
          name: 'Trinity Maintenance Orchestrator'
        },
        statusMessage: `I've detected issues requiring maintenance. Estimated completion in ${estimatedMinutes} minutes.`,
        triadReportId: report.runId
      });
      
      return {
        success: result.success,
        activated: true,
        message: `Maintenance mode activated. Estimated duration: ${estimatedMinutes} minutes.`
      };
    }
    
    if (this.isWithinMaintenanceWindow(schedule)) {
      const result = await maintenanceModeService.activateMaintenance({
        reason: decision.reason,
        estimatedDurationMinutes: estimatedMinutes,
        activatedBy: {
          type: 'trinity',
          id: 'trinity-orchestrator',
          name: 'Trinity Maintenance Orchestrator'
        },
        statusMessage: `Scheduled maintenance in progress. Estimated completion in ${estimatedMinutes} minutes.`,
        triadReportId: report.runId
      });
      
      return {
        success: result.success,
        activated: true,
        message: `Maintenance mode activated during scheduled window. Duration: ${estimatedMinutes} minutes.`
      };
    }
    
    const nextWindow = this.getNextMaintenanceWindow(schedule);
    
    log.info(`[TrinityOrchestrator] Maintenance scheduled for ${nextWindow.toISOString()}`);
    
    return {
      success: true,
      activated: false,
      scheduledFor: nextWindow,
      message: `Maintenance scheduled for ${nextWindow.toLocaleString()}. ${decision.reason}`
    };
  },

  /**
   * Complete maintenance and deactivate
   */
  async completeMaintenance(): Promise<{ success: boolean; message: string }> {
    const currentWindow = await maintenanceModeService.getMaintenanceWindow();
    
    if (!currentWindow.isActive) {
      return {
        success: true,
        message: 'Maintenance mode is not active'
      };
    }
    
    const result = await maintenanceModeService.deactivateMaintenance({
      type: 'trinity',
      id: 'trinity-orchestrator',
      name: 'Trinity Maintenance Orchestrator'
    });
    
    return {
      success: result.success,
      message: 'Maintenance mode deactivated successfully'
    };
  },

  /**
   * Update maintenance progress
   */
  async updateProgress(progressPercent: number, statusMessage?: string): Promise<void> {
    await maintenanceModeService.updateProgress(progressPercent, statusMessage);
  },

  /**
   * Get current maintenance status
   */
  async getStatus(): Promise<{
    isActive: boolean;
    window: MaintenanceWindow;
    isWithinScheduledWindow: boolean;
    nextScheduledWindow: Date;
  }> {
    const window = await maintenanceModeService.getMaintenanceWindow();
    
    return {
      isActive: window.isActive,
      window,
      isWithinScheduledWindow: this.isWithinMaintenanceWindow(),
      nextScheduledWindow: this.getNextMaintenanceWindow()
    };
  }
};

export default trinityMaintenanceOrchestrator;
