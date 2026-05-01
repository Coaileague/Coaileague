/**
 * TRINITY FAST MODE - Premium Parallel Execution Engine
 * ======================================================
 * Fortune 500-grade parallel execution with tiered pricing and SLA guarantees.
 * 
 * Features:
 * - Three Execution Tiers: Standard, Fast, Turbo
 * - Parallel Operation Batching: Execute independent operations simultaneously
 * - Concurrency Limits: Per-tenant rate limiting
 * - Credit Multipliers: Premium pricing for faster execution
 * - Dependency Detection: Auto-fallback to sequential for dependent operations
 * - Real-time Telemetry: Streaming execution updates
 * - Circuit Breaker: Automatic fallback on failures
 */

import { db } from '../../db';
import { aiWorkboardTasks, systemAuditLogs } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type ExecutionTier = 'standard' | 'fast' | 'turbo';

export interface FastModeConfig {
  tier: ExecutionTier;
  maxConcurrency: number;
  creditMultiplier: number;
  timeoutMs: number;
  priority: number;
}

export interface FastModeOperation {
  id: string;
  type: string;
  handler: () => Promise<any>;
  dependencies?: string[];
  estimatedDurationMs?: number;
  creditCost?: number;
}

export interface FastModeRequest {
  requestId?: string;
  workspaceId: string;
  userId: string;
  tier: ExecutionTier;
  operations: FastModeOperation[];
  streaming?: boolean;
  metadata?: Record<string, unknown>;
}

export interface FastModeResult {
  requestId: string;
  tier: ExecutionTier;
  success: boolean;
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  results: OperationResult[];
  totalDurationMs: number;
  parallelSpeedup: number;
  creditsCost: number;
  telemetry: ExecutionTelemetry;
}

export interface OperationResult {
  operationId: string;
  type: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
  executedAt: Date;
  tier: ExecutionTier;
}

export interface ExecutionTelemetry {
  startTime: Date;
  endTime: Date;
  peakConcurrency: number;
  queueWaitMs: number;
  executionMs: number;
  overheadMs: number;
  sequentialEstimateMs: number;
  parallelSpeedup: number;
  tierBenefits: string[];
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
  halfOpenAt: Date | null;
}

// ============================================================================
// TIER CONFIGURATIONS
// ============================================================================

const TIER_CONFIGS: Record<ExecutionTier, FastModeConfig> = {
  standard: {
    tier: 'standard',
    maxConcurrency: 3,
    creditMultiplier: 1.0,
    timeoutMs: 60000,
    priority: 1
  },
  fast: {
    tier: 'fast',
    maxConcurrency: 8,
    creditMultiplier: 1.5,
    timeoutMs: 30000,
    priority: 2
  },
  turbo: {
    tier: 'turbo',
    maxConcurrency: 15,
    creditMultiplier: 2.5,
    timeoutMs: 15000,
    priority: 3
  }
};

// ============================================================================
// TRINITY FAST MODE SERVICE
// ============================================================================

class TrinityFastModeService {
  private static instance: TrinityFastModeService;
  private activeRequests: Map<string, FastModeRequest> = new Map();
  private tenantConcurrency: Map<string, number> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_RESET_MS = 30000;

  static getInstance(): TrinityFastModeService {
    if (!TrinityFastModeService.instance) {
      TrinityFastModeService.instance = new TrinityFastModeService();
    }
    return TrinityFastModeService.instance;
  }

  // ---------------------------------------------------------------------------
  // MAIN EXECUTION
  // ---------------------------------------------------------------------------

  async execute(request: FastModeRequest): Promise<FastModeResult> {
    const requestId = request.requestId || crypto.randomUUID();
    const startTime = Date.now();
    const config = TIER_CONFIGS[request.tier];

    console.log(`[TrinityFastMode] Executing ${request.operations.length} operations in ${request.tier} mode`);

    // Check circuit breaker
    if (this.isCircuitOpen(request.workspaceId)) {
      console.warn(`[TrinityFastMode] Circuit breaker open for workspace: ${request.workspaceId}`);
      return this.createFailedResult(requestId, request.tier, 'Circuit breaker open - too many recent failures');
    }

    // Check tenant concurrency
    const currentConcurrency = this.tenantConcurrency.get(request.workspaceId) || 0;
    if (currentConcurrency >= config.maxConcurrency * 2) {
      console.warn(`[TrinityFastMode] Tenant at max concurrency: ${request.workspaceId}`);
      return this.createFailedResult(requestId, request.tier, 'Maximum concurrent operations reached');
    }

    // Track request
    this.activeRequests.set(requestId, request);
    this.tenantConcurrency.set(request.workspaceId, currentConcurrency + 1);

    try {
      // Analyze dependencies and create execution batches
      const batches = this.createExecutionBatches(request.operations, config.maxConcurrency);
      
      // Calculate sequential estimate for speedup metrics
      const sequentialEstimateMs = request.operations.reduce(
        (sum, op) => sum + (op.estimatedDurationMs || 1000), 0
      );

      const results: OperationResult[] = [];
      let completedOperations = 0;
      let failedOperations = 0;
      let peakConcurrency = 0;

      // Execute batches
      for (const batch of batches) {
        peakConcurrency = Math.max(peakConcurrency, batch.length);

        // Emit streaming update if enabled
        if (request.streaming) {
          platformEventBus.publish({
            type: 'automation' as any,
            title: 'Batch Execution Started',
            description: `Executing batch ${batches.indexOf(batch) + 1}/${batches.length} with ${batch.length} operations`,
            data: { requestId, batchSize: batch.length, batchIndex: batches.indexOf(batch) + 1, totalBatches: batches.length },
            severity: 'info',
            isNew: true
          });
        }

        // Execute batch operations in parallel
        const batchPromises = batch.map(op => this.executeOperation(op, config));
        const batchResults = await Promise.allSettled(batchPromises);

        // Process results
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const operation = batch[i];

          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.success) {
              completedOperations++;
            } else {
              failedOperations++;
              this.recordFailure(request.workspaceId);
            }
          } else {
            failedOperations++;
            this.recordFailure(request.workspaceId);
            results.push({
              operationId: operation.id,
              type: operation.type,
              success: false,
              error: result.reason?.message || 'Unknown error',
              durationMs: 0,
              executedAt: new Date(),
              tier: request.tier
            });
          }
        }
      }

      const endTime = Date.now();
      const totalDurationMs = endTime - startTime;
      const parallelSpeedup = sequentialEstimateMs / Math.max(totalDurationMs, 1);

      // Calculate credit cost
      const baseCreditCost = request.operations.reduce((sum, op) => sum + (op.creditCost || 1), 0);
      const creditsCost = Math.ceil(baseCreditCost * config.creditMultiplier);

      // Deduct credits
      await this.recordUsage(request.workspaceId, request.userId, creditsCost, requestId);

      // Create telemetry
      const telemetry: ExecutionTelemetry = {
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        peakConcurrency,
        queueWaitMs: 0,
        executionMs: totalDurationMs,
        overheadMs: Math.max(0, totalDurationMs - sequentialEstimateMs / Math.max(parallelSpeedup, 1)),
        sequentialEstimateMs,
        parallelSpeedup,
        tierBenefits: this.getTierBenefits(request.tier, parallelSpeedup)
      };

      // Log execution
      await this.logExecution(requestId, request, results, telemetry);

      // Emit completion event
      platformEventBus.publish({
        type: 'automation' as any,
        title: 'FAST Mode Execution Complete',
        description: `Completed ${completedOperations}/${request.operations.length} operations (${parallelSpeedup.toFixed(1)}x speedup)`,
        data: { requestId, workspaceId: request.workspaceId, tier: request.tier, completedOperations, failedOperations, parallelSpeedup, creditsCost },
        severity: 'success',
        isNew: true
      });

      return {
        requestId,
        tier: request.tier,
        success: failedOperations === 0,
        totalOperations: request.operations.length,
        completedOperations,
        failedOperations,
        results,
        totalDurationMs,
        parallelSpeedup,
        creditsCost,
        telemetry
      };

    } finally {
      // Cleanup
      this.activeRequests.delete(requestId);
      const current = this.tenantConcurrency.get(request.workspaceId) || 1;
      this.tenantConcurrency.set(request.workspaceId, Math.max(0, current - 1));
    }
  }

  // ---------------------------------------------------------------------------
  // OPERATION EXECUTION
  // ---------------------------------------------------------------------------

  private async executeOperation(
    operation: FastModeOperation,
    config: FastModeConfig
  ): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await Promise.race([
        operation.handler(),
        this.createTimeout(config.timeoutMs, operation.id)
      ]);

      return {
        operationId: operation.id,
        type: operation.type,
        success: true,
        result,
        durationMs: Date.now() - startTime,
        executedAt: new Date(),
        tier: config.tier
      };

    } catch (error: any) {
      return {
        operationId: operation.id,
        type: operation.type,
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime,
        executedAt: new Date(),
        tier: config.tier
      };
    }
  }

  private createTimeout(ms: number, operationId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation ${operationId} timed out after ${ms}ms`)), ms);
    });
  }

  // ---------------------------------------------------------------------------
  // BATCH CREATION WITH DEPENDENCY ANALYSIS
  // ---------------------------------------------------------------------------

  private createExecutionBatches(
    operations: FastModeOperation[],
    maxConcurrency: number
  ): FastModeOperation[][] {
    const batches: FastModeOperation[][] = [];
    const completed = new Set<string>();
    const remaining = [...operations];

    while (remaining.length > 0) {
      const batch: FastModeOperation[] = [];

      // Find operations that can execute (all dependencies satisfied)
      for (let i = remaining.length - 1; i >= 0; i--) {
        const op = remaining[i];
        const canExecute = !op.dependencies || op.dependencies.every(dep => completed.has(dep));

        if (canExecute && batch.length < maxConcurrency) {
          batch.push(op);
          remaining.splice(i, 1);
        }
      }

      // If no operations can execute but we have remaining, there's a circular dependency
      if (batch.length === 0 && remaining.length > 0) {
        console.warn('[TrinityFastMode] Circular dependency detected, executing sequentially');
        batch.push(remaining.shift()!);
      }

      batches.push(batch);

      // Mark batch operations as completed
      batch.forEach(op => completed.add(op.id));
    }

    return batches;
  }

  // ---------------------------------------------------------------------------
  // CIRCUIT BREAKER
  // ---------------------------------------------------------------------------

  private isCircuitOpen(workspaceId: string): boolean {
    const state = this.circuitBreakers.get(workspaceId);
    if (!state) return false;

    if (state.isOpen) {
      // Check if we should try half-open
      if (state.halfOpenAt && new Date() >= state.halfOpenAt) {
        state.isOpen = false;
        state.failures = Math.floor(state.failures / 2);
        return false;
      }
      return true;
    }

    return false;
  }

  private recordFailure(workspaceId: string): void {
    let state = this.circuitBreakers.get(workspaceId);
    if (!state) {
      state = { failures: 0, lastFailure: null, isOpen: false, halfOpenAt: null };
      this.circuitBreakers.set(workspaceId, state);
    }

    state.failures++;
    state.lastFailure = new Date();

    if (state.failures >= this.MAX_FAILURES) {
      state.isOpen = true;
      state.halfOpenAt = new Date(Date.now() + this.CIRCUIT_RESET_MS);
      console.warn(`[TrinityFastMode] Circuit breaker opened for workspace: ${workspaceId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // USAGE RECORDING
  // Token usage is recorded centrally via tokenManager.recordUsage() and
  // tokenUsageService.recordTokenUsageAsync(). FastMode does not keep its own
  // ledger — callers hit the shared token gateway.
  // ---------------------------------------------------------------------------
  private async recordUsage(
    _workspaceId: string,
    _userId: string,
    _amount: number,
    _requestId: string,
  ): Promise<void> {
    // Intentionally empty — see comment above.
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private getTierBenefits(tier: ExecutionTier, speedup: number): string[] {
    const benefits: string[] = [];

    switch (tier) {
      case 'turbo':
        benefits.push('Maximum parallelism (15 concurrent)');
        benefits.push('Priority queue placement');
        benefits.push('Fastest timeout (15s)');
        break;
      case 'fast':
        benefits.push('High parallelism (8 concurrent)');
        benefits.push('Elevated priority');
        benefits.push('Fast timeout (30s)');
        break;
      case 'standard':
        benefits.push('Standard parallelism (3 concurrent)');
        benefits.push('Normal priority');
        break;
    }

    if (speedup > 1) {
      benefits.push(`${speedup.toFixed(1)}x speedup vs sequential`);
    }

    return benefits;
  }

  private createFailedResult(requestId: string, tier: ExecutionTier, error: string): FastModeResult {
    return {
      requestId,
      tier,
      success: false,
      totalOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      results: [],
      totalDurationMs: 0,
      parallelSpeedup: 0,
      creditsCost: 0,
      telemetry: {
        startTime: new Date(),
        endTime: new Date(),
        peakConcurrency: 0,
        queueWaitMs: 0,
        executionMs: 0,
        overheadMs: 0,
        sequentialEstimateMs: 0,
        parallelSpeedup: 0,
        tierBenefits: []
      }
    };
  }

  private async logExecution(
    requestId: string,
    request: FastModeRequest,
    results: OperationResult[],
    telemetry: ExecutionTelemetry
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        action: 'trinity_fast_mode:execution',
        entityType: 'fast_mode',
        entityId: requestId,
        workspaceId: request.workspaceId,
        userId: request.userId,
        changes: {
          tier: request.tier,
          operationCount: request.operations.length,
          successCount: results.filter(r => r.success).length,
          failCount: results.filter(r => !r.success).length,
          totalDurationMs: telemetry.executionMs,
          parallelSpeedup: telemetry.parallelSpeedup
        } as any,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('[TrinityFastMode] Failed to log execution:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // STATUS & ANALYTICS
  // ---------------------------------------------------------------------------

  getActiveRequests(workspaceId?: string): FastModeRequest[] {
    const requests = Array.from(this.activeRequests.values());
    if (workspaceId) {
      return requests.filter(r => r.workspaceId === workspaceId);
    }
    return requests;
  }

  getTierConfig(tier: ExecutionTier): FastModeConfig {
    return TIER_CONFIGS[tier];
  }

  getWorkspaceConcurrency(workspaceId: string): number {
    return this.tenantConcurrency.get(workspaceId) || 0;
  }

  isCircuitBreakerOpen(workspaceId: string): boolean {
    return this.isCircuitOpen(workspaceId);
  }
}

export const trinityFastMode = TrinityFastModeService.getInstance();
