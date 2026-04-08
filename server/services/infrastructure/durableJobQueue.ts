/**
 * DURABLE JOB QUEUE SERVICE
 * ==========================
 * Database-backed job queue for reliable task execution.
 * Replaces timer-based retry with persistent, crash-recoverable jobs.
 * 
 * Features:
 * - Database persistence for all jobs
 * - Automatic recovery on restart
 * - Retry with exponential backoff
 * - Job prioritization
 * - Dead letter queue for failed jobs
 * - SOX-compliant audit logging
 */

import { db } from '../../db';
import { systemAuditLogs, durableJobQueue as durableJobQueueTable } from '@shared/schema';
import { eq, and, lte, gte, isNull, sql, desc, asc } from 'drizzle-orm';
import { pgTable, varchar, timestamp, integer, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import crypto from 'crypto';
import { RETRIES } from '../../config/platformConfig';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
const log = createLogger('durableJobQueue');


// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export interface JobDefinition {
  type: string;
  payload: Record<string, any>;
  workspaceId?: string;
  priority?: JobPriority;
  maxRetries?: number;
  retryDelayMs?: number;
  scheduledFor?: Date;
  idempotencyKey?: string;
}

export interface Job extends JobDefinition {
  id: string;
  status: JobStatus;
  attempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type JobHandler = (job: Job) => Promise<{ success: boolean; result?: any; error?: string }>;

// ============================================================================
// JOB QUEUE SERVICE
// ============================================================================

class DurableJobQueueService {
  private static instance: DurableJobQueueService;
  private handlers: Map<string, JobHandler> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private initialized = false;
  
  private readonly POLL_INTERVAL_MS = RETRIES.jobPollIntervalMs;
  private readonly MAX_CONCURRENT_JOBS = 5;
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY_MS = RETRIES.jobDefaultRetryDelayMs;

  static getInstance(): DurableJobQueueService {
    if (!this.instance) {
      this.instance = new DurableJobQueueService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Ensure job queue table exists
      await this.ensureTableExists();
      
      // Recover interrupted jobs (stuck in 'processing')
      await this.recoverInterruptedJobs();
      
      // Start processing loop
      this.startProcessingLoop();
      
      this.initialized = true;
      log.info('[DurableJobQueue] Service initialized with database persistence');
    } catch (error) {
      log.error('[DurableJobQueue] Failed to initialize:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
      await typedExec(sql`
        CREATE TABLE IF NOT EXISTS durable_job_queue (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id VARCHAR(100),
          type VARCHAR(100) NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}',
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 3,
          retry_delay_ms INTEGER NOT NULL DEFAULT 30000,
          idempotency_key VARCHAR(255),
          scheduled_for TIMESTAMP WITH TIME ZONE,
          last_attempt_at TIMESTAMP WITH TIME ZONE,
          next_attempt_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          error TEXT,
          result JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(idempotency_key)
        );
        
        CREATE INDEX IF NOT EXISTS idx_job_queue_status_scheduled 
        ON durable_job_queue(status, scheduled_for, priority);
        
        CREATE INDEX IF NOT EXISTS idx_job_queue_type 
        ON durable_job_queue(type);

        CREATE INDEX IF NOT EXISTS idx_job_queue_workspace_id
        ON durable_job_queue(workspace_id);
      `);
    } catch (error) {
      log.error('[DurableJobQueue] Failed to create table:', error);
    }
  }

  private async recoverInterruptedJobs(): Promise<void> {
    try {
      // Jobs stuck in 'processing' status after restart need recovery
      // Converted to Drizzle ORM: recoverInterruptedJobs → INTERVAL
      const results = await db
        .update(durableJobQueueTable)
        .set({
          status: 'pending',
          nextAttemptAt: sql`NOW() + (retry_delay_ms || ' milliseconds')::interval`,
          error: sql`COALESCE(error, '') || ' [Recovered after service restart]'`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(durableJobQueueTable.status, 'processing'))
        .returning({ id: durableJobQueueTable.id, type: durableJobQueueTable.type });

      if (results.length > 0) {
        log.info(`[DurableJobQueue] Recovered ${results.length} interrupted jobs`);

        // Log recovery to audit trail
        await db.insert(systemAuditLogs).values({
          action: 'durable_job_queue_recovery',
          metadata: {
            resource: 'job_queue',
            details: {
              recoveredCount: results.length,
              jobIds: results.map(r => r.id),
              jobTypes: results.map(r => r.type),
            },
          },
        });
      }
    } catch (error) {
      log.error('[DurableJobQueue] Failed to recover interrupted jobs:', error);
    }
  }

  /**
   * Register a handler for a job type
   */
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    log.info(`[DurableJobQueue] Registered handler for job type: ${jobType}`);
  }

  /**
   * Enqueue a new job
   */
  async enqueue(definition: JobDefinition): Promise<string> {
    const jobId = crypto.randomUUID();
    const now = new Date();
    const scheduledFor = definition.scheduledFor || now;
    const priority = definition.priority || 'normal';
    const maxRetries = definition.maxRetries ?? this.DEFAULT_MAX_RETRIES;
    const retryDelayMs = definition.retryDelayMs ?? this.DEFAULT_RETRY_DELAY_MS;

    try {
      // Check idempotency if key provided
      if (definition.idempotencyKey) {
        // CATEGORY C — Raw SQL retained: LIMIT | Tables: durable_job_queue | Verified: 2026-03-23
        const existing = await typedQuery(sql`
          SELECT id, status FROM durable_job_queue 
          WHERE idempotency_key = ${definition.idempotencyKey}
          LIMIT 1
        `);
        
        if (existing.length > 0) {
          const existingJob = existing[0] as any;
          log.info(`[DurableJobQueue] Job with idempotency key already exists: ${existingJob.id}`);
          return existingJob.id;
        }
      }

      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: durable_job_queue | Verified: 2026-03-23
      await db.insert(durableJobQueueTable).values({
        id: jobId,
        workspaceId: definition.workspaceId || null,
        type: definition.type,
        payload: definition.payload,
        priority: priority,
        status: 'pending',
        maxRetries: maxRetries,
        retryDelayMs: retryDelayMs,
        idempotencyKey: definition.idempotencyKey || null,
        scheduledFor: scheduledFor,
        nextAttemptAt: scheduledFor,
        createdAt: now,
        updatedAt: now,
      });

      log.info(`[DurableJobQueue] Enqueued job ${jobId} of type ${definition.type}`);
      return jobId;
    } catch (error: any) {
      log.error('[DurableJobQueue] Failed to enqueue job:', error);
      throw error;
    }
  }

  /**
   * Enqueue a Trinity recovery job (specialized method)
   */
  async enqueueTrinityRecovery(proposalId: string, retryCount: number = 0): Promise<string> {
    return this.enqueue({
      type: 'trinity_proposal_recovery',
      payload: { proposalId, retryCount },
      priority: 'high',
      maxRetries: 3,
      retryDelayMs: 30000,
      idempotencyKey: `trinity_recovery_${proposalId}`,
    });
  }

  /**
   * OMEGA-L8: DLQ Stale-Job Sentinel
   * Scans for dead_letter jobs older than 4 hours and fires a structured ops alert.
   * Called every 30 minutes so the on-call team is notified within one check-window.
   */
  private async checkStaleDeadLetterJobs(): Promise<void> {
    try {
      const { isDbCircuitOpen } = await import('../../db');
      if (isDbCircuitOpen()) return;
    } catch { /* ignore import errors */ }

    try {
      // Alert if total DLQ items > 10
      const totalDlq = await typedQuery<{ count: number }>(sql`
        SELECT COUNT(*)::int as count FROM durable_job_queue WHERE status = 'dead_letter'
      `);
      const dlqCount = totalDlq[0]?.count || 0;
      if (dlqCount > 10) {
        log.error(`[DurableJobQueue] CRITICAL ALERT: DLQ depth exceeded threshold (${dlqCount} > 10)`);
      }

      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const staleJobs = await typedQuery<{ id: string, type: string, error: string, updated_at: string }>(sql`
        SELECT id, type, error, updated_at
        FROM durable_job_queue
        WHERE status = 'dead_letter'
          AND updated_at < ${fourHoursAgo}
        LIMIT 50
      `);
      if (staleJobs.length > 0) {
        log.error('[DurableJobQueue] OMEGA-L8 DLQ ALERT: Stale dead-letter jobs detected (>4 hours unresolved)', {
          count: staleJobs.length,
          oldestJobId: staleJobs[0]?.id,
          types: [...new Set(staleJobs.map((j: any) => j.type))],
          alertTarget: 'support@coaileague.com',
        });
        // Best-effort structured alert via trinityAutonomousNotifier (non-blocking)
        scheduleNonBlocking('durable-job-queue.dlq-sentinel-alert', async () => {
          const { notifySupportStaff } = await import('../ai-brain/trinityAutonomousNotifier');
          await notifySupportStaff({
            workspaceId: 'system',
            severity: 'critical',
            category: 'performance',
            title: `DLQ Sentinel: ${staleJobs.length} stale dead-letter job(s) — unresolved >4 hours`,
            description: `Job types affected: ${[...new Set(staleJobs.map((j: any) => j.type))].join(', ')}. Oldest job ID: ${staleJobs[0]?.id}. Immediate ops review required.`,
            suggestedAction: 'Review dead-letter jobs in the DLQ dashboard. Retry or escalate as appropriate.',
            autoFixAvailable: false,
            autoFixRisk: 'low',
            metadata: {
              staleJobCount: staleJobs.length,
              jobTypes: [...new Set(staleJobs.map((j: any) => j.type))],
              oldestJobId: staleJobs[0]?.id,
              sampleJobs: staleJobs.slice(0, 5).map((j: any) => ({ id: j.id, type: j.type, error: j.error })),
            },
          });
        });
      }
    } catch (err: unknown) {
      log.warn('[DurableJobQueue] checkStaleDeadLetterJobs error (non-blocking):', err instanceof Error ? err.message : String(err));
    }
  }

  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;

  private startProcessingLoop(): void {
    if (this.processingInterval) return;
    
    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) return;
      
      // Skip batch processing when DB circuit breaker is open
      try {
        const { isDbCircuitOpen } = await import('../../db');
        if (isDbCircuitOpen()) return;
      } catch { /* ignore import errors */ }
      
      this.isProcessing = true;
      try {
        await this.processNextBatch();
      } catch (error: any) {
        log.warn('[DurableJobQueue] Processing loop error (will retry):', error?.message || 'unknown');
      } finally {
        this.isProcessing = false;
      }
    }, this.POLL_INTERVAL_MS);

    // OMEGA-L8: DLQ stale-job sentinel — run every 30 minutes
    if (!this.staleCheckInterval) {
      this.staleCheckInterval = setInterval(() => {
        this.checkStaleDeadLetterJobs().catch(() => null);
      }, 30 * 60 * 1000);
      // Fire once at startup (after 5 min warm-up) to catch pre-existing stale jobs
      setTimeout(() => { this.checkStaleDeadLetterJobs().catch(() => null); }, 5 * 60 * 1000);
    }
    
    log.info(`[DurableJobQueue] Started processing loop (${this.POLL_INTERVAL_MS}ms interval)`);
  }

  private async processNextBatch(): Promise<void> {
    const now = new Date();
    
    try {
      // Fetch ready jobs with priority ordering
      // CATEGORY C — Raw SQL retained: FOR UPDATE | Tables: durable_job_queue, SKIP | Verified: 2026-03-23
      const result = await typedQuery(sql`
        SELECT * FROM durable_job_queue
        WHERE status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
          AND (scheduled_for IS NULL OR scheduled_for <= ${now})
        ORDER BY 
          CASE priority 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'normal' THEN 3 
            WHEN 'low' THEN 4 
          END,
          created_at ASC
        LIMIT ${this.MAX_CONCURRENT_JOBS}
        FOR UPDATE SKIP LOCKED
      `);

      const jobs = (result.rows as any[]) || [];
      
      if (jobs.length === 0) return;

      // Process jobs in parallel
      await Promise.all(jobs.map(job => this.processJob(job)));
      
    } catch (error) {
      log.error('[DurableJobQueue] Batch processing error:', error);
    }
  }

  private async processJob(jobRow: any): Promise<void> {
    const jobId = jobRow.id;
    const jobType = jobRow.type;
    const now = new Date();

    // CATEGORY C — Raw SQL retained: Self-referencing arithmetic increment (attempts + 1) | Tables: durable_job_queue | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE durable_job_queue 
      SET status = 'processing', last_attempt_at = ${now}, attempts = attempts + 1, updated_at = ${now}
      WHERE id = ${jobId}
    `);

    const handler = this.handlers.get(jobType);
    if (!handler) {
      log.warn(`[DurableJobQueue] No handler for job type: ${jobType}`);
      await this.markJobFailed(jobId, `No handler registered for job type: ${jobType}`, jobRow);
      return;
    }

    try {
      const job: Job = {
        id: jobRow.id,
        workspaceId: jobRow.workspace_id,
        type: jobRow.type,
        payload: jobRow.payload,
        priority: jobRow.priority,
        status: 'processing',
        attempts: jobRow.attempts + 1,
        maxRetries: jobRow.max_retries,
        retryDelayMs: jobRow.retry_delay_ms,
        lastAttemptAt: now,
        createdAt: new Date(jobRow.created_at),
        updatedAt: now,
      };

      const result = await handler(job);

      if (result.success) {
        await this.markJobCompleted(jobId, result.result);
      } else {
        await this.handleJobFailure(jobId, result.error || 'Unknown error', jobRow);
      }
    } catch (error: any) {
      await this.handleJobFailure(jobId, (error instanceof Error ? error.message : String(error)), jobRow);
    }
  }

  private async markJobCompleted(jobId: string, result?: any): Promise<void> {
    const now = new Date();
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: durable_job_queue | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE durable_job_queue 
      SET 
        status = 'completed', 
        completed_at = ${now}, 
        result = ${result ? JSON.stringify(result) : null}::jsonb,
        updated_at = ${now}
      WHERE id = ${jobId}
    `);
    log.info(`[DurableJobQueue] Job ${jobId} completed`);
  }

  private async markJobFailed(jobId: string, error: string, jobRow: any): Promise<void> {
    const now = new Date();
    const attempts = (jobRow.attempts || 0) + 1;
    const maxRetries = jobRow.max_retries || this.DEFAULT_MAX_RETRIES;
    
    if (attempts >= maxRetries) {
      // CATEGORY C — Raw SQL retained: Infrastructure job queue status UPDATE | Tables: durable_job_queue | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE durable_job_queue 
        SET status = 'dead_letter', error = ${error}, updated_at = ${now}
        WHERE id = ${jobId}
      `);
      log.warn(`[DurableJobQueue] Job ${jobId} moved to dead letter queue after ${attempts} attempts`);
      
      // Log to audit trail
      await db.insert(systemAuditLogs).values({
        action: 'job_moved_to_dead_letter',
        metadata: { resource: 'job_queue', details: { jobId, jobType: jobRow.type, error, attempts } },
      });
    } else {
      await this.scheduleRetry(jobId, error, jobRow);
    }
  }

  private async handleJobFailure(jobId: string, error: string, jobRow: any): Promise<void> {
    await this.markJobFailed(jobId, error, jobRow);
  }

  private async scheduleRetry(jobId: string, error: string, jobRow: any): Promise<void> {
    const now = new Date();
    const attempts = (jobRow.attempts || 0) + 1;
    const retryDelayMs = jobRow.retry_delay_ms || this.DEFAULT_RETRY_DELAY_MS;
    
    // Exponential backoff
    const backoffMultiplier = Math.pow(2, attempts - 1);
    const nextAttemptDelay = retryDelayMs * backoffMultiplier;
    const nextAttemptAt = new Date(now.getTime() + nextAttemptDelay);
    
    // CATEGORY C — Raw SQL retained: Infrastructure job queue retry scheduling UPDATE | Tables: durable_job_queue | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE durable_job_queue 
      SET 
        status = 'pending', 
        error = ${error}, 
        next_attempt_at = ${nextAttemptAt},
        updated_at = ${now}
      WHERE id = ${jobId}
    `);
    
    log.info(`[DurableJobQueue] Job ${jobId} scheduled for retry at ${nextAttemptAt.toISOString()}`);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    const result = await db.select().from(durableJobQueueTable).where(eq(durableJobQueueTable.id, jobId));
    
    const row = result[0];
    return {
      id: row.id,
      workspaceId: (row as any).workspaceId,
      type: row.type,
      payload: row.payload as Record<string, any>,
      priority: row.priority as JobPriority,
      status: row.status as JobStatus,
      attempts: row.attempts,
      maxRetries: row.maxRetries,
      retryDelayMs: row.retryDelayMs,
      lastAttemptAt: row.lastAttemptAt ? new Date(row.lastAttemptAt) : undefined,
      nextAttemptAt: row.nextAttemptAt ? new Date(row.nextAttemptAt) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      error: row.error || undefined,
      result: row.result as Record<string, any> | undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    deadLetter: number;
  }> {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: durable_job_queue | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT status, COUNT(*)::int as count 
      FROM durable_job_queue 
      GROUP BY status
    `);
    
    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
    };
    
    for (const row of (result as any[]) || []) {
      switch (row.status) {
        case 'pending': stats.pending = row.count; break;
        case 'processing': stats.processing = row.count; break;
        case 'completed': stats.completed = row.count; break;
        case 'failed': stats.failed = row.count; break;
        case 'dead_letter': stats.deadLetter = row.count; break;
      }
    }
    
    return stats;
  }

  /**
   * Retry dead letter jobs
   */
  async retryDeadLetterJobs(jobType?: string): Promise<number> {
    const now = new Date();
    let query = sql`
      UPDATE durable_job_queue 
      SET status = 'pending', attempts = 0, next_attempt_at = ${now}, updated_at = ${now}
      WHERE status = 'dead_letter'
    `;
    
    if (jobType) {
      query = sql`
        UPDATE durable_job_queue 
        SET status = 'pending', attempts = 0, next_attempt_at = ${now}, updated_at = ${now}
        WHERE status = 'dead_letter' AND type = ${jobType}
      `;
    }
    
    // CATEGORY C — Raw SQL retained: Infrastructure job queue dead letter retry UPDATE | Tables: durable_job_queue | Verified: 2026-03-23
    const result = await typedQuery(query);
    const count = (result as any).rowCount || 0;
    
    log.info(`[DurableJobQueue] Retried ${count} dead letter jobs`);
    return count;
  }

  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
    log.info('[DurableJobQueue] Service shutdown');
  }
}

export const durableJobQueue = DurableJobQueueService.getInstance();
