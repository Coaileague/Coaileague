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
import { systemAuditLogs } from '@shared/schema';
import { eq, and, lte, gte, isNull, sql, desc, asc } from 'drizzle-orm';
import { pgTable, varchar, timestamp, integer, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export interface JobDefinition {
  type: string;
  payload: Record<string, any>;
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
  
  private readonly POLL_INTERVAL_MS = 5000;
  private readonly MAX_CONCURRENT_JOBS = 5;
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY_MS = 30000;

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
      console.log('[DurableJobQueue] Service initialized with database persistence');
    } catch (error) {
      console.error('[DurableJobQueue] Failed to initialize:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS durable_job_queue (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
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
      `);
    } catch (error) {
      console.error('[DurableJobQueue] Failed to create table:', error);
    }
  }

  private async recoverInterruptedJobs(): Promise<void> {
    try {
      // Jobs stuck in 'processing' status after restart need recovery
      const result = await db.execute(sql`
        UPDATE durable_job_queue 
        SET 
          status = 'pending',
          next_attempt_at = NOW() + (retry_delay_ms || ' milliseconds')::interval,
          error = COALESCE(error, '') || ' [Recovered after service restart]',
          updated_at = NOW()
        WHERE status = 'processing'
        RETURNING id, type
      `);
      
      const recovered = (result.rows as any[]) || [];
      if (recovered.length > 0) {
        console.log(`[DurableJobQueue] Recovered ${recovered.length} interrupted jobs`);
        
        // Log recovery to audit trail
        await db.insert(systemAuditLogs).values({
          action: 'durable_job_queue_recovery',
          resource: 'job_queue',
          details: {
            recoveredCount: recovered.length,
            jobIds: recovered.map((r: any) => r.id),
            jobTypes: recovered.map((r: any) => r.type),
          },
        });
      }
    } catch (error) {
      console.error('[DurableJobQueue] Failed to recover interrupted jobs:', error);
    }
  }

  /**
   * Register a handler for a job type
   */
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    console.log(`[DurableJobQueue] Registered handler for job type: ${jobType}`);
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
        const existing = await db.execute(sql`
          SELECT id, status FROM durable_job_queue 
          WHERE idempotency_key = ${definition.idempotencyKey}
          LIMIT 1
        `);
        
        if ((existing.rows as any[])?.length > 0) {
          const existingJob = (existing.rows as any[])[0];
          console.log(`[DurableJobQueue] Job with idempotency key already exists: ${existingJob.id}`);
          return existingJob.id;
        }
      }

      await db.execute(sql`
        INSERT INTO durable_job_queue (
          id, type, payload, priority, status, max_retries, retry_delay_ms,
          idempotency_key, scheduled_for, next_attempt_at, created_at, updated_at
        ) VALUES (
          ${jobId}, ${definition.type}, ${JSON.stringify(definition.payload)}::jsonb,
          ${priority}, 'pending', ${maxRetries}, ${retryDelayMs},
          ${definition.idempotencyKey || null}, ${scheduledFor}, ${scheduledFor},
          ${now}, ${now}
        )
      `);

      console.log(`[DurableJobQueue] Enqueued job ${jobId} of type ${definition.type}`);
      return jobId;
    } catch (error: any) {
      console.error('[DurableJobQueue] Failed to enqueue job:', error);
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

  private startProcessingLoop(): void {
    if (this.processingInterval) return;
    
    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) return;
      
      this.isProcessing = true;
      try {
        await this.processNextBatch();
      } catch (error) {
        console.error('[DurableJobQueue] Processing loop error:', error);
      } finally {
        this.isProcessing = false;
      }
    }, this.POLL_INTERVAL_MS);
    
    console.log(`[DurableJobQueue] Started processing loop (${this.POLL_INTERVAL_MS}ms interval)`);
  }

  private async processNextBatch(): Promise<void> {
    const now = new Date();
    
    try {
      // Fetch ready jobs with priority ordering
      const result = await db.execute(sql`
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
      console.error('[DurableJobQueue] Batch processing error:', error);
    }
  }

  private async processJob(jobRow: any): Promise<void> {
    const jobId = jobRow.id;
    const jobType = jobRow.type;
    const now = new Date();

    // Mark as processing
    await db.execute(sql`
      UPDATE durable_job_queue 
      SET status = 'processing', last_attempt_at = ${now}, attempts = attempts + 1, updated_at = ${now}
      WHERE id = ${jobId}
    `);

    const handler = this.handlers.get(jobType);
    if (!handler) {
      console.warn(`[DurableJobQueue] No handler for job type: ${jobType}`);
      await this.markJobFailed(jobId, `No handler registered for job type: ${jobType}`, jobRow);
      return;
    }

    try {
      const job: Job = {
        id: jobRow.id,
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
      await this.handleJobFailure(jobId, error.message, jobRow);
    }
  }

  private async markJobCompleted(jobId: string, result?: any): Promise<void> {
    const now = new Date();
    await db.execute(sql`
      UPDATE durable_job_queue 
      SET 
        status = 'completed', 
        completed_at = ${now}, 
        result = ${result ? JSON.stringify(result) : null}::jsonb,
        updated_at = ${now}
      WHERE id = ${jobId}
    `);
    console.log(`[DurableJobQueue] Job ${jobId} completed`);
  }

  private async markJobFailed(jobId: string, error: string, jobRow: any): Promise<void> {
    const now = new Date();
    const attempts = (jobRow.attempts || 0) + 1;
    const maxRetries = jobRow.max_retries || this.DEFAULT_MAX_RETRIES;
    
    if (attempts >= maxRetries) {
      // Move to dead letter queue
      await db.execute(sql`
        UPDATE durable_job_queue 
        SET status = 'dead_letter', error = ${error}, updated_at = ${now}
        WHERE id = ${jobId}
      `);
      console.warn(`[DurableJobQueue] Job ${jobId} moved to dead letter queue after ${attempts} attempts`);
      
      // Log to audit trail
      await db.insert(systemAuditLogs).values({
        action: 'job_moved_to_dead_letter',
        resource: 'job_queue',
        details: { jobId, jobType: jobRow.type, error, attempts },
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
    
    await db.execute(sql`
      UPDATE durable_job_queue 
      SET 
        status = 'pending', 
        error = ${error}, 
        next_attempt_at = ${nextAttemptAt},
        updated_at = ${now}
      WHERE id = ${jobId}
    `);
    
    console.log(`[DurableJobQueue] Job ${jobId} scheduled for retry at ${nextAttemptAt.toISOString()}`);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    const result = await db.execute(sql`
      SELECT * FROM durable_job_queue WHERE id = ${jobId}
    `);
    
    const rows = result.rows as any[];
    if (rows.length === 0) return null;
    
    const row = rows[0];
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      priority: row.priority,
      status: row.status,
      attempts: row.attempts,
      maxRetries: row.max_retries,
      retryDelayMs: row.retry_delay_ms,
      lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : undefined,
      nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error,
      result: row.result,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
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
    const result = await db.execute(sql`
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
    
    for (const row of (result.rows as any[]) || []) {
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
    
    const result = await db.execute(query);
    const count = (result as any).rowCount || 0;
    
    console.log(`[DurableJobQueue] Retried ${count} dead letter jobs`);
    return count;
  }

  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log('[DurableJobQueue] Service shutdown');
  }
}

export const durableJobQueue = DurableJobQueueService.getInstance();
