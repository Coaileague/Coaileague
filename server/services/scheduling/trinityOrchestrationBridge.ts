/**
 * TRINITY ORCHESTRATION BRIDGE
 * ============================
 * Connects autonomous scheduling to Trinity's orchestration layer
 * for full visibility and governance control
 */

import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityOrchestrationBridge');


/**
 * Register scheduling capabilities with Trinity orchestration
 */
export function registerSchedulingWithOrchestration() {
  log.info('[TrinityOrchestrationBridge] Registering scheduling capabilities...');
  
  // Register event listeners for scheduling orchestration
  platformEventBus.on('trinity_scheduling_request', async (data: any) => {
    const { trinityAutonomousScheduler } = await import('./trinityAutonomousScheduler');
    
    log.info('[TrinityOrchestrationBridge] Received scheduling request via orchestration');
    
    try {
      const result = await trinityAutonomousScheduler.executeAutonomousScheduling({
        workspaceId: data.workspaceId,
        userId: data.userId || 'trinity-orchestration',
        mode: data.mode || 'current_week',
        prioritizeBy: data.prioritizeBy || 'urgency',
        useContractorFallback: data.useContractorFallback ?? true,
        maxShiftsPerEmployee: data.maxShiftsPerEmployee || 6,
        respectAvailability: data.respectAvailability ?? true,
      });
      
      log.info(`[TrinityOrchestrationBridge] Scheduling complete (autonomous scheduler already broadcast completion)`);
      
    } catch (error: any) {
      log.error('[TrinityOrchestrationBridge] Scheduling error:', error);
      platformEventBus.emit('trinity_scheduling_failed', {
        workspaceId: data.workspaceId,
        sessionId: data.sessionId,
        error: (error instanceof Error ? error.message : String(error)),
      });
    }
  });
  
  // Register with inbound opportunity agent
  platformEventBus.on('work_request_received', async (data: any) => {
    log.info('[TrinityOrchestrationBridge] Inbound work request - triggering auto-scheduling');
    
    try {
      // Parse work request and create shift
      const { workRequestParser } = await import('../trinityStaffing/workRequestParser');
      const parsedRequest = await workRequestParser.parseWorkRequest(data.content);
      
      if (parsedRequest.success && parsedRequest.shift) {
        // Auto-schedule the created shift
        platformEventBus.emit('trinity_scheduling_request', {
          workspaceId: data.workspaceId,
          userId: 'trinity-inbound-agent',
          mode: 'current_day',
          prioritizeBy: 'urgency',
        });
      }
    } catch (error) {
      log.error('[TrinityOrchestrationBridge] Work request processing error:', error);
    }
  });
  
  log.info('[TrinityOrchestrationBridge] Scheduling capabilities registered');
}

/**
 * Scheduling governance policy check
 */
export async function checkSchedulingGovernance(
  workspaceId: string,
  action: 'auto_fill' | 'create_shift' | 'modify_shift' | 'cancel_shift'
): Promise<{ allowed: boolean; reason: string }> {
  // Check workspace settings for scheduling automation permissions
  // In a full implementation, this would check workspace.settings.schedulingAutomation
  
  return {
    allowed: true,
    reason: 'Scheduling automation enabled for workspace',
  };
}

/**
 * Get real-time scheduling status for orchestration dashboard
 */
export async function getSchedulingOrchestrationStatus(workspaceId: string): Promise<{
  daemonRunning: boolean;
  lastRun: Date | null;
  pendingShifts: number;
  automationEnabled: boolean;
}> {
  const { autonomousSchedulingDaemon } = await import('./autonomousSchedulingDaemon');
  const { shifts } = await import('@shared/schema');
  const { eq, isNull, gte, and } = await import('drizzle-orm');
  
  const status = await autonomousSchedulingDaemon.getStatus();
  
  const pendingShifts = await db.select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      isNull(shifts.employeeId),
      gte(shifts.startTime, new Date())
    ));
  
  return {
    daemonRunning: status.isRunning,
    lastRun: status.lastRun,
    pendingShifts: pendingShifts.length,
    automationEnabled: true,
  };
}

// Singleton guard — prevents double listener registration if module is re-evaluated
let _registered = false;
export function ensureSchedulingBridgeRegistered() {
  if (_registered) return;
  _registered = true;
  registerSchedulingWithOrchestration();
}

// Auto-register on import (guarded)
ensureSchedulingBridgeRegistered();

export { registerSchedulingWithOrchestration as default };
