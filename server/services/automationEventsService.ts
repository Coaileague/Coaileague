/**
 * Automation Events Service
 * 
 * Tracks and manages automation job events for:
 * - Invoice Generation (nightly)
 * - Payroll Processing (biweekly)
 * - Schedule Generation (weekly)
 * - Compliance Checks (daily)
 * - System Maintenance (various)
 * 
 * Provides real-time visibility into automation status and retry controls.
 */

import { db } from '../db';
import { systemAuditLogs } from '@shared/schema';
import { broadcastToAllClients } from '../websocket';
import { aiActivityService } from './aiActivityService';
import { createLogger } from '../lib/logger';
const log = createLogger('automationEventsService');


export type AutomationJobType = 
  | 'invoicing'
  | 'payroll'
  | 'scheduling'
  | 'compliance'
  | 'cleanup'
  | 'credit_reset'
  | 'email_automation'
  | 'shift_reminders'
  | 'ai_billing'
  | 'platform_monitor'
  | 'ws_cleanup'
  | 'room_auto_close'
  | 'trial_expiry';

export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface AutomationJobEvent {
  id: string;
  type: AutomationJobType;
  status: JobStatus;
  workspaceId?: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  result?: {
    processed?: number;
    skipped?: number;
    failed?: number;
    message?: string;
    details?: Record<string, unknown>;
  };
  error?: string;
  retryCount: number;
  canRetry: boolean;
}

export interface AutomationStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  successRate: number;
  lastRun: Date | null;
  averageDuration: number;
}

class AutomationEventsService {
  private static instance: AutomationEventsService;
  private recentEvents: Map<string, AutomationJobEvent> = new Map();
  private maxEvents = 100;
  private jobRetryLimits: Record<AutomationJobType, number> = {
    invoicing: 3,
    payroll: 2,
    scheduling: 3,
    compliance: 2,
    cleanup: 1,
    credit_reset: 2,
    email_automation: 3,
    shift_reminders: 2,
    ai_billing: 2,
    platform_monitor: 1,
    ws_cleanup: 1,
    room_auto_close: 1,
    trial_expiry: 2,
  };

  static getInstance(): AutomationEventsService {
    if (!this.instance) {
      this.instance = new AutomationEventsService();
    }
    return this.instance;
  }

  /**
   * Start tracking a job execution
   */
  startJob(
    type: AutomationJobType,
    options: { workspaceId?: string; retryCount?: number } = {}
  ): string {
    const id = `${type}-${Date.now()}-${crypto.randomUUID().slice(0, 7)}`;
    
    const event: AutomationJobEvent = {
      id,
      type,
      status: 'running',
      workspaceId: options.workspaceId,
      startedAt: new Date(),
      retryCount: options.retryCount || 0,
      canRetry: (options.retryCount || 0) < this.jobRetryLimits[type],
    };

    this.recentEvents.set(id, event);
    this.pruneOldEvents();

    aiActivityService.startSearching('Automation', { 
      workspaceId: options.workspaceId, 
      message: `Running ${this.getJobLabel(type)}...` 
    });

    this.broadcastEvent('automation_job_started', event);
    log.info(`[Automation] Started: ${type} (${id})`);

    return id;
  }

  /**
   * Mark job as completed successfully
   */
  completeJob(
    jobId: string,
    result?: {
      processed?: number;
      skipped?: number;
      failed?: number;
      message?: string;
      details?: Record<string, unknown>;
    }
  ): void {
    const event = this.recentEvents.get(jobId);
    if (!event) { log.warn(`[Automation] completeJob called for unknown jobId=${jobId} — may have been lost on server restart`); return; }
    event.status = 'success';
    event.completedAt = new Date();
    event.result = result;

    aiActivityService.complete('Automation', { 
      workspaceId: event.workspaceId,
      message: result?.message || `${this.getJobLabel(event.type)} completed` 
    });

    this.broadcastEvent('automation_job_completed', event);
    this.logToDatabase(event);
    log.info(`[Automation] Completed: ${event.type} (${jobId}) in ${event.duration}ms`);
  }

  /**
   * Mark job as failed
   */
  failJob(jobId: string, error: string): void {
    const event = this.recentEvents.get(jobId);
    if (!event) { log.warn(`[Automation] failJob called for unknown jobId=${jobId} — may have been lost on server restart`); return; }
    event.status = 'failed';
    event.completedAt = new Date();
    event.error = error;
    event.canRetry = event.retryCount < this.jobRetryLimits[event.type];

    aiActivityService.error('Automation', { 
      workspaceId: event.workspaceId,
      message: `${this.getJobLabel(event.type)} failed` 
    });

    this.broadcastEvent('automation_job_failed', event);
    this.logToDatabase(event);
    log.error(`[Automation] Failed: ${event.type} (${jobId}): ${error}`);
  }

  /**
   * Mark job as skipped (e.g., no work needed)
   */
  skipJob(jobId: string, reason: string): void {
    const event = this.recentEvents.get(jobId);
    if (!event) { log.warn(`[Automation] skipJob called for unknown jobId=${jobId} — may have been lost on server restart`); return; }
    event.status = 'skipped';
    event.completedAt = new Date();
    event.result = { message: reason };

    aiActivityService.idle('Automation', { workspaceId: event.workspaceId });

    this.broadcastEvent('automation_job_skipped', event);
    log.info(`[Automation] Skipped: ${event.type} (${jobId}): ${reason}`);
  }

  /**
   * Get recent events (for API)
   */
  getRecentEvents(options: {
    type?: AutomationJobType;
    status?: JobStatus;
    workspaceId?: string;
    limit?: number;
  } = {}): AutomationJobEvent[] {
    const limit = options.limit || 50;
    let events = Array.from(this.recentEvents.values());

    if (options.type) {
      events = events.filter(e => e.type === options.type);
    }
    if (options.status) {
      events = events.filter(e => e.status === options.status);
    }
    if (options.workspaceId) {
      // G22 FIX: Strict tenant isolation — only return events explicitly tagged to
      // this workspace. Events stored without a workspaceId must not bleed across tenants.
      events = events.filter(e => e.workspaceId === options.workspaceId);
    }

    return events
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get stats for a specific job type
   */
  async getStats(type?: AutomationJobType): Promise<Record<AutomationJobType, AutomationStats>> {
    const stats: Record<string, AutomationStats> = {};
    const types: AutomationJobType[] = type ? [type] : [
      'invoicing', 'payroll', 'scheduling', 'compliance', 'cleanup',
      'credit_reset', 'email_automation', 'shift_reminders', 'ai_billing',
      'platform_monitor', 'ws_cleanup', 'room_auto_close', 'trial_expiry'
    ];

    for (const jobType of types) {
      const events = this.getRecentEvents({ type: jobType });
      const successful = events.filter(e => e.status === 'success');
      const failed = events.filter(e => e.status === 'failed');
      const durations = events
        .filter(e => e.duration)
        .map(e => e.duration!);

      stats[jobType] = {
        totalJobs: events.length,
        successfulJobs: successful.length,
        failedJobs: failed.length,
        successRate: events.length > 0 ? (successful.length / events.length) * 100 : 100,
        lastRun: events.length > 0 ? events[0].startedAt : null,
        averageDuration: durations.length > 0 
          ? durations.reduce((a, b) => a + b, 0) / durations.length 
          : 0,
      };
    }

    return stats as Record<AutomationJobType, AutomationStats>;
  }

  /**
   * Request retry for a failed job
   */
  async requestRetry(jobId: string): Promise<{ success: boolean; message: string; newJobId?: string }> {
    const event = this.recentEvents.get(jobId);
    if (!event) {
      return { success: false, message: 'Job not found' };
    }
    if (!event.canRetry) {
      return { success: false, message: 'Job cannot be retried (max retries exceeded)' };
    }
    if (event.status !== 'failed') {
      return { success: false, message: 'Only failed jobs can be retried' };
    }

    return { 
      success: true, 
      message: `Retry queued for ${this.getJobLabel(event.type)}`,
      newJobId: this.startJob(event.type, { 
        workspaceId: event.workspaceId, 
        retryCount: event.retryCount + 1 
      })
    };
  }

  private getJobLabel(type: AutomationJobType): string {
    const labels: Record<AutomationJobType, string> = {
      invoicing: 'Invoice Generation',
      payroll: 'Payroll Processing',
      scheduling: 'Schedule Generation',
      compliance: 'Compliance Check',
      cleanup: 'Data Cleanup',
      credit_reset: 'Credit Reset',
      email_automation: 'Email Automation',
      shift_reminders: 'Shift Reminders',
      ai_billing: 'AI Billing',
      platform_monitor: 'Platform Monitor',
      ws_cleanup: 'WebSocket Cleanup',
      room_auto_close: 'Room Auto-Close',
      trial_expiry: 'Trial Expiry Check',
    };
    return labels[type] || type;
  }

  private pruneOldEvents(): void {
    if (this.recentEvents.size <= this.maxEvents) return;

    const sorted = Array.from(this.recentEvents.entries())
      .sort((a, b) => b[1].startedAt.getTime() - a[1].startedAt.getTime());

    const toDelete = sorted.slice(this.maxEvents);
    toDelete.forEach(([id]) => this.recentEvents.delete(id));
  }

  private broadcastEvent(eventType: string, event: AutomationJobEvent): void {
    try {
      broadcastToAllClients({
        type: eventType,
        event,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error('[Automation] Failed to broadcast event:', error);
    }
  }

  private async logToDatabase(event: AutomationJobEvent): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        action: `automation_${event.type}_${event.status}`,
        entityType: 'automation_job',
        entityId: event.id,
        workspaceId: event.workspaceId || undefined,
        metadata: {
          jobId: event.id,
          jobType: event.type,
          status: event.status,
          duration: event.duration,
          retryCount: event.retryCount,
          result: event.result,
          error: event.error,
        },
        ipAddress: 'system-automation',
      });
    } catch (error) {
      log.error('[Automation] Failed to log to database:', error);
    }
  }
}

export const automationEventsService = AutomationEventsService.getInstance();
export default automationEventsService;
