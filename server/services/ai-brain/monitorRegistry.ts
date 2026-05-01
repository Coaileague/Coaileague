/**
 * MONITOR REGISTRY - Monitoring Task Management
 * 
 * Manages registration, scheduling, and execution of monitoring tasks
 */

import { db } from '../../db';
import { aiMonitoringTasks, type AiMonitoringTask } from '@shared/schema';
import { eq, and, lte, isNull, or } from 'drizzle-orm';
import type { MonitorDefinition, ScheduledMonitor } from './types';

export class MonitorRegistry {
  private monitors = new Map<string, MonitorDefinition>();

  /**
   * Register a monitor definition (keyed by monitoringType)
   */
  registerMonitor(definition: MonitorDefinition): void {
    this.monitors.set(definition.monitoringType, definition);
    console.log(`📋 [MonitorRegistry] Registered monitor: ${definition.name} (${definition.monitoringType})`);
  }

  /**
   * Get a monitor definition by monitoring type
   */
  getMonitor(monitoringType: string): MonitorDefinition | undefined {
    return this.monitors.get(monitoringType);
  }

  /**
   * Get all registered monitors
   */
  getAllMonitors(): MonitorDefinition[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Get active monitoring tasks from database
   */
  async getActiveMonitors(workspaceId?: string | null): Promise<ScheduledMonitor[]> {
    const conditions = [eq(aiMonitoringTasks.status, 'active')];

    if (workspaceId !== undefined) {
      if (workspaceId === null) {
        conditions.push(isNull(aiMonitoringTasks.workspaceId));
      } else {
        conditions.push(eq(aiMonitoringTasks.workspaceId, workspaceId));
      }
    }

    const tasks = await db
      .select()
      .from(aiMonitoringTasks)
      .where(and(...conditions));

    return tasks.map(task => this.mapToScheduledMonitor(task));
  }

  /**
   * Get monitors that are due to run
   */
  async getDueMonitors(): Promise<ScheduledMonitor[]> {
    const now = new Date();

    const tasks = await db
      .select()
      .from(aiMonitoringTasks)
      .where(
        and(
          eq(aiMonitoringTasks.status, 'active'),
          or(
            lte(aiMonitoringTasks.nextRunAt, now),
            isNull(aiMonitoringTasks.nextRunAt) // Never run before
          )
        )
      )
      .limit(50); // Process up to 50 monitors per batch

    console.log(`⏰ [MonitorRegistry] Found ${tasks.length} monitors due to run`);
    return tasks.map(task => this.mapToScheduledMonitor(task));
  }

  /**
   * Create a new monitoring task in database
   */
  async createMonitorTask(params: {
    workspaceId: string | null;
    scope: 'global' | 'workspace';
    monitoringType: string;
    targetEntityType: string;
    targetEntityId?: string;
    configuration?: Record<string, unknown>;
    runIntervalMinutes?: number;
    createdBy?: string;
  }): Promise<ScheduledMonitor> {
    const definition = this.monitors.get(params.monitoringType);
    const runIntervalMinutes = params.runIntervalMinutes || definition?.runIntervalMinutes || 1440; // 24h default

    const [task] = await db
      .insert(aiMonitoringTasks)
      .values({
        workspaceId: params.workspaceId,
        scope: params.scope,
        monitoringType: params.monitoringType as any,
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId || '',
        configuration: params.configuration || {},
        runIntervalMinutes,
        nextRunAt: new Date(), // Run immediately
        status: 'active',
        createdBy: params.createdBy || null,
      })
      .returning();

    console.log(`🆕 [MonitorRegistry] Created monitoring task ${task.id} for ${params.monitoringType}`);
    return this.mapToScheduledMonitor(task);
  }

  /**
   * Schedule next run for a monitoring task
   */
  async scheduleNextRun(taskId: string, runAt?: Date): Promise<void> {
    const [task] = await db
      .select()
      .from(aiMonitoringTasks)
      .where(eq(aiMonitoringTasks.id, taskId))
      .limit(1);

    if (!task) {
      console.warn(`⚠️ [MonitorRegistry] Task ${taskId} not found for scheduling`);
      return;
    }

    const nextRunAt = runAt || new Date(Date.now() + task.runIntervalMinutes * 60 * 1000);

    await db
      .update(aiMonitoringTasks)
      .set({
        nextRunAt,
        lastRunAt: new Date(),
        consecutiveFailures: 0, // Reset on successful schedule
        updatedAt: new Date(),
      })
      .where(eq(aiMonitoringTasks.id, taskId));

    console.log(`📅 [MonitorRegistry] Scheduled ${taskId} for ${nextRunAt.toISOString()}`);
  }

  /**
   * Record monitoring task failure
   */
  async recordFailure(taskId: string, reason: string): Promise<void> {
    const [task] = await db
      .select()
      .from(aiMonitoringTasks)
      .where(eq(aiMonitoringTasks.id, taskId))
      .limit(1);

    if (!task) {
      console.warn(`⚠️ [MonitorRegistry] Task ${taskId} not found for failure recording`);
      return;
    }

    const consecutiveFailures = task.consecutiveFailures + 1;
    const newStatus = consecutiveFailures >= 3 ? 'failed' : 'active';

    await db
      .update(aiMonitoringTasks)
      .set({
        consecutiveFailures,
        failureReason: reason,
        lastRunStatus: 'failed' as any,
        status: newStatus as any,
        updatedAt: new Date(),
      })
      .where(eq(aiMonitoringTasks.id, taskId));

    if (newStatus === 'failed') {
      console.error(`❌ [MonitorRegistry] Task ${taskId} marked as failed after ${consecutiveFailures} failures`);
    } else {
      console.warn(`⚠️ [MonitorRegistry] Task ${taskId} failed (${consecutiveFailures}/3): ${reason}`);
    }
  }

  /**
   * Pause a monitoring task
   */
  async pauseMonitor(taskId: string): Promise<void> {
    await db
      .update(aiMonitoringTasks)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(aiMonitoringTasks.id, taskId));

    console.log(`⏸️ [MonitorRegistry] Paused monitor ${taskId}`);
  }

  /**
   * Resume a monitoring task
   */
  async resumeMonitor(taskId: string): Promise<void> {
    await db
      .update(aiMonitoringTasks)
      .set({
        status: 'active',
        nextRunAt: new Date(), // Run immediately
        consecutiveFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(aiMonitoringTasks.id, taskId));

    console.log(`▶️ [MonitorRegistry] Resumed monitor ${taskId}`);
  }

  /**
   * Map database task to ScheduledMonitor
   */
  private mapToScheduledMonitor(task: AiMonitoringTask): ScheduledMonitor {
    return {
      taskId: task.id,
      monitoringType: task.monitoringType,
      workspaceId: task.workspaceId,
      scope: task.scope,
      targetEntityType: task.targetEntityType,
      targetEntityId: task.targetEntityId,
      configuration: task.configuration as Record<string, any>,
      nextRunAt: task.nextRunAt,
    };
  }
}
