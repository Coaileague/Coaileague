/**
 * AutomationCheckpointer — Step-by-step execution state for Trinity automations
 *
 * Every automation (invoicing, payroll, scheduling, time_tracking) is broken into
 * named steps. Before and after each step executes, its state is persisted to the
 * trinityAutomationRequests.checkpointData column.
 *
 * On any failure or interruption:
 *  - The checkpoint records exactly which step failed and what was already completed
 *  - Trinity reads the checkpoint, explains the current state, and offers to resume
 *  - On resume, completed steps are skipped; execution continues from the failed step
 *
 * Step status lifecycle:
 *   pending → running → completed
 *                    ↘ failed (recoverable) | skipped
 */

import { db } from '../../db';
import { trinityAutomationRequests } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('automation-checkpointer');

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AutomationStepState {
  name: string;
  label: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
  attemptCount: number;
}

export interface AutomationCheckpoint {
  version: 1;
  feature: string;
  requestId: string;
  workspaceId: string;
  initializedAt: string;
  lastUpdatedAt: string;
  steps: AutomationStepState[];
  resumable: boolean;
  resumeFromStep?: string;
  partialResults: Record<string, unknown>;
}

export interface StepDefinition {
  name: string;
  label: string;
}

// ──────────────────────────────────────────────
// Step definitions per feature
// ──────────────────────────────────────────────

export const AUTOMATION_STEPS: Record<string, StepDefinition[]> = {
  invoicing: [
    { name: 'read_state',        label: 'Analyze current billing state' },
    { name: 'fetch_hours',       label: 'Aggregate approved, unbilled hours' },
    { name: 'validate',          label: 'Validate billing data and rates' },
    { name: 'generate_invoices', label: 'Generate draft invoices per client' },
    { name: 'notify',            label: 'Publish completion notification' },
  ],
  payroll: [
    { name: 'read_state',    label: 'Analyze current payroll state' },
    { name: 'fetch_hours',   label: 'Aggregate approved time entries' },
    { name: 'validate',      label: 'Validate rates, FLSA compliance, tax data' },
    { name: 'calculate',     label: 'Calculate gross pay, taxes, deductions' },
    { name: 'commit',        label: 'Commit payroll run and mark entries' },
    { name: 'notify',        label: 'Send payroll ready notification' },
  ],
  scheduling: [
    { name: 'read_state',      label: 'Analyze current schedule state' },
    { name: 'generate_shifts', label: 'Generate optimized weekly shifts' },
    { name: 'notify',          label: 'Publish schedule notification' },
  ],
  time_tracking: [
    { name: 'read_state',      label: 'Count pending entries eligible for approval' },
    { name: 'approve_entries', label: 'Auto-approve pending entries with clock-out' },
    { name: 'notify',          label: 'Publish approval summary' },
  ],
  shift_monitoring: [
    { name: 'acknowledge', label: 'Acknowledge shift monitoring activation' },
  ],
  quickbooks_sync: [
    { name: 'acknowledge', label: 'Acknowledge QuickBooks sync activation' },
  ],
};

// ──────────────────────────────────────────────
// AutomationCheckpointer class
// ──────────────────────────────────────────────

export class AutomationCheckpointer {
  constructor(
    private readonly requestId: string,
    private readonly feature: string,
    private readonly workspaceId: string,
  ) {}

  /**
   * Initialize a fresh checkpoint for this automation request.
   * Safe to call multiple times — will not overwrite existing checkpoint.
   */
  async init(): Promise<AutomationCheckpoint> {
    const existing = await this.getCheckpoint();
    if (existing) return existing;

    const stepDefs = AUTOMATION_STEPS[this.feature] ?? [{ name: 'execute', label: 'Execute automation' }];
    const now = new Date().toISOString();

    const checkpoint: AutomationCheckpoint = {
      version: 1,
      feature: this.feature,
      requestId: this.requestId,
      workspaceId: this.workspaceId,
      initializedAt: now,
      lastUpdatedAt: now,
      steps: stepDefs.map(s => ({
        name: s.name,
        label: s.label,
        status: 'pending',
        attemptCount: 0,
      })),
      resumable: false,
      partialResults: {},
    };

    await this._persist(checkpoint);
    return checkpoint;
  }

  /**
   * Mark a step as started. Call this BEFORE executing the step's logic.
   */
  async stepStarted(stepName: string): Promise<AutomationCheckpoint> {
    const cp = await this._requireCheckpoint();
    const step = cp.steps.find(s => s.name === stepName);
    if (!step) throw new Error(`[Checkpoint] Unknown step "${stepName}" for feature "${this.feature}"`);

    step.status = 'running';
    step.startedAt = new Date().toISOString();
    step.attemptCount = (step.attemptCount ?? 0) + 1;
    step.error = undefined;
    cp.lastUpdatedAt = new Date().toISOString();
    cp.resumable = false; // Clear until a step fails

    await this._persist(cp);
    log.info(`${this.feature}/${this.requestId} → step "${stepName}" started (attempt ${step.attemptCount})`);
    return cp;
  }

  /**
   * Mark a step as successfully completed. Call this AFTER the step's logic succeeds.
   * result is stored and available to subsequent steps via getStepResult().
   */
  async stepCompleted(stepName: string, result?: Record<string, unknown>): Promise<AutomationCheckpoint> {
    const cp = await this._requireCheckpoint();
    const step = cp.steps.find(s => s.name === stepName);
    if (!step) throw new Error(`[Checkpoint] Unknown step "${stepName}"`);

    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    step.result = result;
    step.error = undefined;
    if (result) {
      Object.assign(cp.partialResults, { [stepName]: result });
    }
    cp.lastUpdatedAt = new Date().toISOString();

    await this._persist(cp);
    log.info(`${this.feature}/${this.requestId} → step "${stepName}" ✓ completed`);
    return cp;
  }

  /**
   * Mark a step as failed. The checkpoint is saved as resumable so Trinity can continue later.
   */
  async stepFailed(stepName: string, error: string): Promise<AutomationCheckpoint> {
    const cp = await this._requireCheckpoint();
    const step = cp.steps.find(s => s.name === stepName);
    if (!step) throw new Error(`[Checkpoint] Unknown step "${stepName}"`);

    step.status = 'failed';
    step.error = error;
    cp.resumable = true;
    cp.resumeFromStep = stepName;
    cp.lastUpdatedAt = new Date().toISOString();

    await this._persist(cp);
    log.info(`${this.feature}/${this.requestId} → step "${stepName}" FAILED — checkpoint saved, automation is resumable`);
    return cp;
  }

  /**
   * Mark a step as skipped (already completed in a previous run).
   */
  async stepSkipped(stepName: string, priorResult?: Record<string, unknown>): Promise<AutomationCheckpoint> {
    const cp = await this._requireCheckpoint();
    const step = cp.steps.find(s => s.name === stepName);
    if (step) {
      step.status = 'skipped';
      if (priorResult) Object.assign(cp.partialResults, { [stepName]: priorResult });
      cp.lastUpdatedAt = new Date().toISOString();
      await this._persist(cp);
    }
    log.info(`${this.feature}/${this.requestId} → step "${stepName}" skipped (already completed)`);
    return cp;
  }

  /**
   * Returns true if this step was completed in a prior run (safe to skip on resume).
   */
  isStepCompleted(checkpoint: AutomationCheckpoint, stepName: string): boolean {
    return checkpoint.steps.find(s => s.name === stepName)?.status === 'completed';
  }

  /**
   * Returns true if this step was skipped (due to completion in a prior run).
   */
  isStepSkippable(checkpoint: AutomationCheckpoint, stepName: string): boolean {
    const s = checkpoint.steps.find(s => s.name === stepName);
    return s?.status === 'completed' || s?.status === 'skipped';
  }

  /**
   * Get the result saved from a prior completed step.
   */
  getStepResult(checkpoint: AutomationCheckpoint, stepName: string): Record<string, any> | undefined {
    return checkpoint.partialResults[stepName] ?? checkpoint.steps.find(s => s.name === stepName)?.result;
  }

  /**
   * Read the current checkpoint from the database.
   */
  async getCheckpoint(): Promise<AutomationCheckpoint | null> {
    const [row] = await db
      .select({ checkpointData: trinityAutomationRequests.checkpointData })
      .from(trinityAutomationRequests)
      .where(eq(trinityAutomationRequests.id, this.requestId))
      .limit(1);

    if (!row || !row.checkpointData) return null;
    return row.checkpointData as AutomationCheckpoint;
  }

  /**
   * Analyze the current checkpoint and return a human-readable summary.
   * Trinity uses this to explain the state and decide what to do next.
   */
  analyzeState(checkpoint: AutomationCheckpoint): {
    summary: string;
    canResume: boolean;
    resumeFromStep?: string;
    completedCount: number;
    totalSteps: number;
    failedStep?: AutomationStepState;
  } {
    const total = checkpoint.steps.length;
    const completed = checkpoint.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
    const failed = checkpoint.steps.find(s => s.status === 'failed');
    const running = checkpoint.steps.find(s => s.status === 'running');

    let summary = '';
    if (running) {
      summary = `Step "${running.label}" was still running when the automation was interrupted. It may need to be checked for partial data before resuming.`;
    } else if (failed) {
      summary = `Completed ${completed}/${total} steps. Failed at "${failed.label}": ${failed.error ?? 'Unknown error'}. Automation is resumable — steps already completed will be skipped.`;
    } else if (completed === total) {
      summary = `All ${total} steps completed successfully.`;
    } else {
      summary = `${completed}/${total} steps completed.`;
    }

    return {
      summary,
      canResume: checkpoint.resumable,
      resumeFromStep: checkpoint.resumeFromStep,
      completedCount: completed,
      totalSteps: total,
      failedStep: failed,
    };
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private async _persist(checkpoint: AutomationCheckpoint): Promise<void> {
    await db
      .update(trinityAutomationRequests)
      .set({ checkpointData: checkpoint as any, updatedAt: new Date() })
      .where(eq(trinityAutomationRequests.id, this.requestId));
  }

  private async _requireCheckpoint(): Promise<AutomationCheckpoint> {
    const cp = await this.getCheckpoint();
    if (!cp) throw new Error(`[Checkpoint] No checkpoint found for request ${this.requestId} — call init() first`);
    return cp;
  }
}

/**
 * Factory: create a checkpointer, initialize it, and return both.
 */
export async function createCheckpointer(
  requestId: string,
  feature: string,
  workspaceId: string,
): Promise<{ checkpointer: AutomationCheckpointer; checkpoint: AutomationCheckpoint }> {
  const checkpointer = new AutomationCheckpointer(requestId, feature, workspaceId);
  const checkpoint = await checkpointer.init();
  return { checkpointer, checkpoint };
}
