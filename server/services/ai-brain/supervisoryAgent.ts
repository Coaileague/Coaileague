/**
 * SupervisoryAgent - Workflow resume/rollback and SLA tracking
 * 
 * Provides:
 * - Automatic workflow recovery on restart
 * - SLA monitoring and alerting
 * - Rollback orchestration
 * - Cross-agent coordination
 * - Health monitoring
 */

import { workflowLedger, RunStatus } from './workflowLedger';
import { commitmentManager } from './commitmentManager';
import { realTimeBridge } from './realTimeBridge';
import { aiBrainEvents } from './internalEventEmitter';
import { createLogger } from '../../lib/logger';
const log = createLogger('supervisoryAgent');

export interface SupervisoryConfig {
  checkIntervalMs: number;
  slaWarningThresholdPercent: number;
  maxConcurrentRuns: number;
  autoRecoveryEnabled: boolean;
  alertOnSLABreach: boolean;
}

export interface WorkflowHealth {
  activeRuns: number;
  pendingApprovals: number;
  failedRuns24h: number;
  slaBreaches24h: number;
  avgDurationMs: number;
  isHealthy: boolean;
  issues: string[];
}

const DEFAULT_CONFIG: SupervisoryConfig = {
  checkIntervalMs: 30000,
  slaWarningThresholdPercent: 80,
  maxConcurrentRuns: 10,
  autoRecoveryEnabled: true,
  alertOnSLABreach: true,
};

class SupervisoryAgentService {
  private static instance: SupervisoryAgentService;
  private config: SupervisoryConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private constructor(config?: Partial<SupervisoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<SupervisoryConfig>): SupervisoryAgentService {
    if (!SupervisoryAgentService.instance) {
      SupervisoryAgentService.instance = new SupervisoryAgentService(config);
    }
    return SupervisoryAgentService.instance;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    log.info('[SupervisoryAgent] Starting supervision...');

    this.recoverIncompleteWorkflows();

    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkIntervalMs);

    aiBrainEvents.on('workflow_failed', (data: any) => {
      this.handleWorkflowFailure(data);
    });

    aiBrainEvents.on('workflow_completed', (data: any) => {
      if (!data.slaMet && this.config.alertOnSLABreach) {
        this.handleSLABreach(data);
      }
    });
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    log.info('[SupervisoryAgent] Stopped supervision');
  }

  private async recoverIncompleteWorkflows() {
    if (!this.config.autoRecoveryEnabled) return;

    try {
      const incompleteRuns = await workflowLedger.getIncompleteRuns();
      
      for (const run of incompleteRuns) {
        log.info(`[SupervisoryAgent] Recovering run ${run.id} (${run.actionId})`);

        if (run.status === 'running') {
          const timeSinceStart = run.startedAt 
            ? Date.now() - new Date(run.startedAt).getTime()
            : 0;

          if (timeSinceStart > (run.slaThresholdMs || 30000) * 3) {
            await workflowLedger.failRun(run.id, 'Timed out during recovery');
            
            const commitments = await commitmentManager.getActiveCommitments({ runId: run.id });
            for (const commitment of commitments) {
              await commitmentManager.rollback(commitment.id, 'Workflow timed out during recovery');
            }
          } else {
            await workflowLedger.cancelRun(run.id, 'Cancelled during recovery - restart required');
          }
        }
      }

      log.info(`[SupervisoryAgent] Recovered ${incompleteRuns.length} workflows`);
    } catch (error) {
      log.error('[SupervisoryAgent] Recovery failed:', error);
    }
  }

  private async performHealthCheck() {
    try {
      const { isDbCircuitOpen } = await import('../../db');
      if (isDbCircuitOpen()) return;
    } catch { /* ignore */ }
    try {
      const health = await this.getHealth();

      if (!health.isHealthy) {
        realTimeBridge.sendSystemAlert('warning', 'Workflow health issues detected', {
          issues: health.issues,
          activeRuns: health.activeRuns,
          failedRuns24h: health.failedRuns24h,
        });

        aiBrainEvents.emit('workflow_health_warning', health);
      }

      const pendingRuns = await workflowLedger.getPendingRuns();
      const pendingApprovals = pendingRuns.filter(r => r.status === 'awaiting_approval');

      if (pendingApprovals.length > 0) {
        for (const run of pendingApprovals) {
          const waitTime = Date.now() - new Date(run.createdAt!).getTime();
          if (waitTime > 3600000) {
            realTimeBridge.sendSystemAlert('warning', 'Workflow awaiting approval for over 1 hour', {
              runId: run.id,
              actionId: run.actionId,
              waitTimeMinutes: Math.round(waitTime / 60000),
            });
          }
        }
      }

    } catch (error: any) {
      log.warn('[SupervisoryAgent] Health check failed (will retry next interval):', error?.message || 'unknown');
    }
  }

  private async handleWorkflowFailure(data: { runId: string; actionId: string; error: string; retryCount: number }) {
    log.info(`[SupervisoryAgent] Handling failure for ${data.runId}: ${data.error}`);

    const run = await workflowLedger.getRun(data.runId);
    if (!run) return;

    if (data.retryCount < (run.maxRetries || 3)) {
      realTimeBridge.broadcastWorkflowProgress({
        runId: data.runId,
        actionId: data.actionId,
        status: 'queued',
        message: `Retrying (attempt ${data.retryCount + 1}/${run.maxRetries || 3})`,
        timestamp: new Date().toISOString(),
      });
    } else {
      realTimeBridge.sendSystemAlert('error', `Workflow ${data.actionId} failed after ${data.retryCount} retries`, {
        runId: data.runId,
        error: data.error,
      });

      realTimeBridge.triggerMascotReaction('concerned', `A workflow has failed: ${data.actionId}`);
    }
  }

  private async handleSLABreach(data: { runId: string; actionId: string; durationMs: number }) {
    log.info(`[SupervisoryAgent] SLA breach for ${data.runId}: ${data.durationMs}ms`);

    realTimeBridge.sendSystemAlert('warning', `SLA breach: ${data.actionId} took ${Math.round(data.durationMs / 1000)}s`, {
      runId: data.runId,
      durationMs: data.durationMs,
    });
  }

  async getHealth(): Promise<WorkflowHealth> {
    const since = new Date();
    since.setHours(since.getHours() - 24);

    const metrics = await workflowLedger.getMetrics({ since });
    const incompleteRuns = await workflowLedger.getIncompleteRuns();
    const pendingApprovals = await commitmentManager.getPendingApprovals();

    const issues: string[] = [];

    if (incompleteRuns.length > this.config.maxConcurrentRuns) {
      issues.push(`Too many concurrent runs: ${incompleteRuns.length}/${this.config.maxConcurrentRuns}`);
    }

    if (metrics.slaComplianceRate < (this.config.slaWarningThresholdPercent / 100)) {
      issues.push(`SLA compliance below threshold: ${Math.round(metrics.slaComplianceRate * 100)}%`);
    }

    if (metrics.failedRuns > metrics.completedRuns * 0.1) {
      issues.push(`High failure rate: ${metrics.failedRuns}/${metrics.totalRuns} runs failed`);
    }

    if (pendingApprovals.length > 5) {
      issues.push(`${pendingApprovals.length} workflows awaiting approval`);
    }

    return {
      activeRuns: incompleteRuns.length,
      pendingApprovals: pendingApprovals.length,
      failedRuns24h: metrics.failedRuns,
      slaBreaches24h: Math.round(metrics.totalRuns * (1 - metrics.slaComplianceRate)),
      avgDurationMs: metrics.averageDurationMs,
      isHealthy: issues.length === 0,
      issues,
    };
  }

  async requestRollback(runId: string, reason: string): Promise<boolean> {
    try {
      const run = await workflowLedger.getRun(runId);
      if (!run) return false;

      const commitments = await commitmentManager.getActiveCommitments({ runId });
      
      for (const commitment of commitments) {
        await commitmentManager.rollback(commitment.id, reason);
      }

      await workflowLedger.cancelRun(runId, `Rolled back: ${reason}`);

      realTimeBridge.broadcastWorkflowProgress({
        runId,
        actionId: run.actionId,
        status: 'rolled_back',
        message: `Rolled back: ${reason}`,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      log.error(`[SupervisoryAgent] Rollback failed for ${runId}:`, error);
      return false;
    }
  }

  async pauseWorkflow(runId: string, reason?: string): Promise<boolean> {
    const run = await workflowLedger.getRun(runId);
    if (!run || run.status !== 'running') return false;

    await workflowLedger.cancelRun(runId, reason || 'Paused by supervisor');
    return true;
  }

  updateConfig(config: Partial<SupervisoryConfig>) {
    this.config = { ...this.config, ...config };
    
    if (this.isRunning && config.checkIntervalMs) {
      this.stop();
      this.start();
    }
  }

  getConfig(): SupervisoryConfig {
    return { ...this.config };
  }
}

export const supervisoryAgent = SupervisoryAgentService.getInstance();
