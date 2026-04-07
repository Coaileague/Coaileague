/**
 * TRINITY EXECUTION FABRIC
 * ========================
 * Architect-grade execution engine that gives Trinity intelligent autonomy.
 * Implements the Plan → Prepare → Execute → Validate pipeline.
 * 
 * Core Capabilities:
 * - Execution Tools: Test runners, file operations, validation, commits
 * - Job Manifests: Structured execution plans with pre-flight validation
 * - Self-Healing: Automatic retry, rollback, and remediation
 * - Telemetry: Complete observability for all operations
 * - Knowledge Integration: Learning from outcomes to improve future execution
 */

import { aiBrainTestRunner } from './aiBrainTestRunner';
import { aiBrainFileSystemTools } from './aiBrainFileSystemTools';
import { aiBrainWorkflowExecutor } from './aiBrainWorkflowExecutor';
import { knowledgeOrchestrationService } from './knowledgeOrchestrationService';
import { trinityMemoryService } from './trinityMemoryService';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import {
  trinityConversationSessions,
  automationActionLedger
} from '@shared/schema';
import crypto from 'crypto';

import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityExecutionFabric');

// ============================================================================
// TYPES
// ============================================================================

export type ExecutionPhase = 'planning' | 'preparing' | 'executing' | 'validating' | 'completed' | 'failed' | 'rolled_back';

export type CapabilityType = 
  | 'file_read' 
  | 'file_write' 
  | 'file_edit' 
  | 'file_delete'
  | 'test_run' 
  | 'test_validate'
  | 'search_code'
  | 'analyze_code'
  | 'commit_change'
  | 'rollback_change'
  | 'execute_workflow'
  | 'query_database'
  | 'send_notification'
  | 'call_ai_model';

export interface ExecutionManifest {
  id: string;
  name: string;
  description: string;
  intent: string;
  domain: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  
  // Execution plan
  steps: ExecutionStep[];
  currentStep: number;
  phase: ExecutionPhase;
  
  // Context
  workspaceId: string;
  userId: string;
  conversationId?: string;
  
  // Validation
  preflightChecks: PreflightCheck[];
  postflightValidations: PostflightValidation[];
  
  // State
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  
  // Results
  stepResults: StepResult[];
  finalResult?: any;
  
  // Rollback
  rollbackSteps: RollbackStep[];
  canRollback: boolean;
}

export interface ExecutionStep {
  id: string;
  order: number;
  capability: CapabilityType;
  action: string;
  parameters: Record<string, any>;
  
  // Dependencies
  dependsOn?: string[];
  
  // Execution config
  timeout: number;
  retryCount: number;
  maxRetries: number;
  
  // State
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface PreflightCheck {
  id: string;
  name: string;
  type: 'permission' | 'resource' | 'dependency' | 'state' | 'credit';
  check: () => Promise<PreflightResult>;
  required: boolean;
}

export interface PreflightResult {
  passed: boolean;
  message: string;
  details?: Record<string, any>;
  canProceed: boolean;
  warnings?: string[];
}

export interface PostflightValidation {
  id: string;
  name: string;
  type: 'state' | 'output' | 'side_effect' | 'integration';
  validate: (result: any) => Promise<ValidationResult>;
}

export interface ValidationResult {
  passed: boolean;
  message: string;
  issues?: string[];
  suggestions?: string[];
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output: any;
  error?: string;
  durationMs: number;
  tokensUsed?: number;
  retryAttempts: number;
}

export interface RollbackStep {
  stepId: string;
  rollbackAction: string;
  rollbackParams: Record<string, any>;
  executed: boolean;
}

export interface ExecutionContext {
  workspaceId: string;
  userId: string;
  userRole: string;
  conversationId?: string;
  creditsAvailable: number;
  permissions: string[];
  previousExecutions?: ExecutionManifest[];
}

export interface ThinkingProcess {
  id: string;
  phase: 'analyzing' | 'planning' | 'reasoning' | 'deciding';
  thoughts: ThoughtStep[];
  conclusion: string;
  confidence: number;
  durationMs: number;
}

export interface ThoughtStep {
  step: number;
  type: 'observation' | 'analysis' | 'hypothesis' | 'verification' | 'decision';
  content: string;
  evidence?: string[];
  confidence: number;
}

// ============================================================================
// AUDIT-GRADE REPLAY TYPES
// ============================================================================

export interface ExecutionRecording {
  recordingId: string;
  manifestId: string;
  
  // Full context snapshot at recording time
  manifest: ExecutionManifest;
  context: ExecutionContext;
  
  // Execution timeline
  timeline: ExecutionTimelineEntry[];
  
  // Environment state at execution time
  environmentSnapshot: EnvironmentSnapshot;
  
  // Metadata
  recordedAt: Date;
  recordedBy: string;
  reason: 'failure' | 'audit' | 'debug' | 'manual';
  
  // Replay tracking
  replayCount: number;
  lastReplayedAt?: Date;
  lastReplayResult?: 'success' | 'failure' | 'partial';
}

export interface ExecutionTimelineEntry {
  timestamp: Date;
  stepId: string;
  phase: ExecutionPhase;
  action: string;
  input: Record<string, any>;
  output: any;
  durationMs: number;
  success: boolean;
  error?: string;
  retryAttempt: number;
  memoryUsageMB?: number;
}

export interface EnvironmentSnapshot {
  timestamp: Date;
  nodeVersion: string;
  platform: string;
  activeManifestCount: number;
  memoryUsageMB: number;
  configHash: string;
}

export interface ReplayOptions {
  dryRun?: boolean;
  fromStep?: number;
  stopAtStep?: number;
  modifiedParameters?: Record<string, Record<string, any>>;
  skipFailedSteps?: boolean;
  debugMode?: boolean;
}

export interface ReplayResult {
  replayId: string;
  recordingId: string;
  success: boolean;
  stepsExecuted: number;
  stepsSkipped: number;
  stepsFailed: number;
  durationMs: number;
  timeline: ExecutionTimelineEntry[];
  divergences: ReplayDivergence[];
  error?: string;
}

export interface ReplayDivergence {
  stepId: string;
  field: string;
  originalValue: any;
  replayValue: any;
  severity: 'info' | 'warning' | 'error';
}

// ============================================================================
// CAPABILITY ADAPTERS
// ============================================================================

interface CapabilityAdapter {
  name: string;
  type: CapabilityType;
  execute: (params: Record<string, any>, context: ExecutionContext) => Promise<any>;
  validate: (params: Record<string, any>) => Promise<boolean>;
  estimateCost: (params: Record<string, any>) => number;
  createRollback?: (params: Record<string, any>, result: any) => RollbackStep | null;
}

const capabilityAdapters: Map<CapabilityType, CapabilityAdapter> = new Map();

// File System Adapters
capabilityAdapters.set('file_read', {
  name: 'File Read',
  type: 'file_read',
  execute: async (params, context) => {
    const result = await aiBrainFileSystemTools.readFile(params.path, {}, context.userId);
    return result;
  },
  validate: async (params) => !!params.path,
  estimateCost: () => 0,
});

capabilityAdapters.set('file_write', {
  name: 'File Write',
  type: 'file_write',
  execute: async (params, context) => {
    const result = await aiBrainFileSystemTools.writeFile(
      params.path, 
      params.content, 
      {},
      context.userId
    );
    return result;
  },
  validate: async (params) => !!params.path && params.content !== undefined,
  estimateCost: () => 1,
  createRollback: (params) => ({
    stepId: crypto.randomUUID(),
    rollbackAction: 'file_delete',
    rollbackParams: { path: params.path },
    executed: false,
  }),
});

capabilityAdapters.set('file_edit', {
  name: 'File Edit',
  type: 'file_edit',
  execute: async (params, context) => {
    const result = await aiBrainFileSystemTools.editFile(
      params.path,
      params.oldString,
      params.newString,
      {},
      context.userId
    );
    return result;
  },
  validate: async (params) => !!params.path && !!params.oldString && params.newString !== undefined,
  estimateCost: () => 1,
  createRollback: (params) => ({
    stepId: crypto.randomUUID(),
    rollbackAction: 'file_edit',
    rollbackParams: { 
      path: params.path, 
      oldString: params.newString, 
      newString: params.oldString 
    },
    executed: false,
  }),
});

// Test Runner Adapters
capabilityAdapters.set('test_run', {
  name: 'Run Tests',
  type: 'test_run',
  execute: async (params) => {
    if (params.testId) {
      return await aiBrainTestRunner.runTest(params.testId);
    } else if (params.category) {
      return await aiBrainTestRunner.runTestsByCategory(params.category);
    }
    return await aiBrainTestRunner.runAllTests();
  },
  validate: async () => true,
  estimateCost: () => 2,
});

capabilityAdapters.set('test_validate', {
  name: 'Validate Tests',
  type: 'test_validate',
  execute: async () => {
    // Run all tests and return validation summary
    const suiteResult = await aiBrainTestRunner.runAllTests('execution-fabric');
    const passing = suiteResult.results.filter(r => r.status === 'passed').length;
    const total = suiteResult.results.length;
    return {
      passing,
      failing: total - passing,
      passRate: total > 0 ? (passing / total) * 100 : 0,
      results: suiteResult.results,
    };
  },
  validate: async () => true,
  estimateCost: () => 0,
});

// Search and Analysis Adapters
capabilityAdapters.set('search_code', {
  name: 'Search Code',
  type: 'search_code',
  execute: async (params, context) => {
    return await aiBrainFileSystemTools.searchFiles(
      params.directory || '.',
      { pattern: params.pattern, maxResults: 50 },
      context.userId
    );
  },
  validate: async (params) => !!params.pattern,
  estimateCost: () => 0,
});

capabilityAdapters.set('analyze_code', {
  name: 'Analyze Code',
  type: 'analyze_code',
  execute: async (params, context) => {
    const fileResult = await aiBrainFileSystemTools.readFile(params.path, {}, context.userId);
    const fileContent = fileResult.success && fileResult.data ? fileResult.data : '';
    return {
      path: params.path,
      content: fileContent,
      analysis: {
        lineCount: fileContent?.split('\n').length || 0,
        type: params.path.split('.').pop(),
      },
    };
  },
  validate: async (params) => !!params.path,
  estimateCost: () => 1,
});

// Workflow Execution Adapter
capabilityAdapters.set('execute_workflow', {
  name: 'Execute Workflow',
  type: 'execute_workflow',
  execute: async (params) => {
    return await aiBrainWorkflowExecutor.executeWorkflow(params.workflowId, params.context || {});
  },
  validate: async (params) => !!params.workflowId,
  estimateCost: (params) => params.estimatedCredits || 5,
});

// AI Model Calling Adapter
capabilityAdapters.set('call_ai_model', {
  name: 'Call AI Model',
  type: 'call_ai_model',
  execute: async (params) => {
    const routingDecision = await knowledgeOrchestrationService.routeQuery(
      params.prompt,
      {
        userId: params.userId || 'system',
        userRole: params.userRole || 'org_owner',
        workspaceId: params.workspaceId,
      }
    );
    
    return {
      routing: routingDecision,
      prompt: params.prompt,
    };
  },
  validate: async (params) => !!params.prompt,
  estimateCost: (params) => params.estimatedTokens ? Math.ceil(params.estimatedTokens / 1000) : 3,
});

// ============================================================================
// TRINITY EXECUTION FABRIC CLASS
// ============================================================================

class TrinityExecutionFabric {
  private static instance: TrinityExecutionFabric;
  private activeManifests: Map<string, ExecutionManifest> = new Map();
  private executionHistory: ExecutionManifest[] = [];
  private thinkingProcesses: Map<string, ThinkingProcess> = new Map();
  
  // Audit-Grade Replay Storage
  private executionRecordings: Map<string, ExecutionRecording> = new Map();
  private activeTimelines: Map<string, ExecutionTimelineEntry[]> = new Map();
  private readonly MAX_RECORDINGS = 100;
  private readonly RECORDING_RETENTION_HOURS = 72;
  
  static getInstance(): TrinityExecutionFabric {
    if (!this.instance) {
      this.instance = new TrinityExecutionFabric();
    }
    return this.instance;
  }

  // ============================================================================
  // AUDIT-GRADE REPLAY - Recording & Playback
  // ============================================================================

  /**
   * Record execution state for audit and replay capability
   * Captures full context snapshot including environment state
   */
  async recordExecution(
    manifestId: string,
    context: ExecutionContext,
    reason: ExecutionRecording['reason'] = 'audit'
  ): Promise<ExecutionRecording> {
    const manifest = this.activeManifests.get(manifestId) || 
                     this.executionHistory.find(m => m.id === manifestId);
    
    if (!manifest) {
      throw new Error(`Manifest not found for recording: ${manifestId}`);
    }

    const recordingId = `rec-${crypto.randomUUID()}`;
    const timeline = this.activeTimelines.get(manifestId) || [];
    
    const recording: ExecutionRecording = {
      recordingId,
      manifestId,
      manifest: JSON.parse(JSON.stringify(manifest)),
      context: JSON.parse(JSON.stringify(context)),
      timeline: [...timeline],
      environmentSnapshot: this.captureEnvironmentSnapshot(),
      recordedAt: new Date(),
      recordedBy: context.userId,
      reason,
      replayCount: 0,
    };

    this.executionRecordings.set(recordingId, recording);
    
    // Enforce retention policy
    this.cleanupOldRecordings();
    
    log.info(`[TrinityFabric] Recorded execution ${manifestId} as ${recordingId} (reason: ${reason})`);
    
    // Publish event for observability
    platformEventBus.publish('ai_brain_action', {
      action: 'execution_recorded',
      recordingId,
      manifestId,
      reason,
      stepsRecorded: timeline.length,
    });

    return recording;
  }

  /**
   * Replay a recorded execution with optional modifications
   * Supports partial replay, parameter overrides, and dry-run mode
   */
  async replayExecution(
    recordingId: string,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    const recording = this.executionRecordings.get(recordingId);
    
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const replayId = `replay-${crypto.randomUUID()}`;
    const startTime = Date.now();
    const timeline: ExecutionTimelineEntry[] = [];
    const divergences: ReplayDivergence[] = [];
    
    log.info(`[TrinityFabric] Starting replay ${replayId} of recording ${recordingId}`);

    let stepsExecuted = 0;
    let stepsSkipped = 0;
    let stepsFailed = 0;
    let replayError: string | undefined;

    try {
      // Recreate manifest from recording
      const replayManifest: ExecutionManifest = JSON.parse(JSON.stringify(recording.manifest));
      replayManifest.id = `replay-${replayManifest.id}`;
      replayManifest.createdAt = new Date();
      replayManifest.startedAt = undefined;
      replayManifest.completedAt = undefined;
      replayManifest.stepResults = [];
      replayManifest.phase = 'planning';

      // Reset step states
      for (const step of replayManifest.steps) {
        step.status = 'pending';
        step.retryCount = 0;
        step.result = undefined;
        step.error = undefined;
        step.startedAt = undefined;
        step.completedAt = undefined;
        step.durationMs = undefined;

        // Apply parameter modifications if provided
        if (options.modifiedParameters?.[step.id]) {
          const originalParams = JSON.stringify(step.parameters);
          step.parameters = { ...step.parameters, ...options.modifiedParameters[step.id] };
          
          divergences.push({
            stepId: step.id,
            field: 'parameters',
            originalValue: JSON.parse(originalParams),
            replayValue: step.parameters,
            severity: 'info',
          });
        }
      }

      // Store replay manifest
      this.activeManifests.set(replayManifest.id, replayManifest);
      this.activeTimelines.set(replayManifest.id, []);

      // Recreate context
      const replayContext: ExecutionContext = JSON.parse(JSON.stringify(recording.context));

      if (options.dryRun) {
        log.info(`[TrinityFabric] Dry-run mode - simulating replay without execution`);
        
        for (let i = 0; i < replayManifest.steps.length; i++) {
          const step = replayManifest.steps[i];
          
          if (options.fromStep !== undefined && i < options.fromStep) {
            stepsSkipped++;
            continue;
          }
          if (options.stopAtStep !== undefined && i > options.stopAtStep) {
            break;
          }

          // Simulate step with original outcome
          const originalEntry = recording.timeline.find(t => t.stepId === step.id);
          timeline.push({
            timestamp: new Date(),
            stepId: step.id,
            phase: 'executing',
            action: step.action,
            input: step.parameters,
            output: originalEntry?.output ?? null,
            durationMs: 0,
            success: true,
            retryAttempt: 0,
          });
          stepsExecuted++;
        }
      } else {
        // Execute replay
        replayManifest.phase = 'executing';
        replayManifest.startedAt = new Date();

        for (let i = 0; i < replayManifest.steps.length; i++) {
          const step = replayManifest.steps[i];
          
          if (options.fromStep !== undefined && i < options.fromStep) {
            step.status = 'skipped';
            stepsSkipped++;
            continue;
          }
          if (options.stopAtStep !== undefined && i > options.stopAtStep) {
            break;
          }

          // Check if original step failed and skip if requested
          const originalEntry = recording.timeline.find(t => t.stepId === step.id);
          if (options.skipFailedSteps && originalEntry && !originalEntry.success) {
            step.status = 'skipped';
            stepsSkipped++;
            continue;
          }

          // Execute step
          const stepResult = await this.executeStep(step, replayContext, replayManifest);
          
          const entry: ExecutionTimelineEntry = {
            timestamp: new Date(),
            stepId: step.id,
            phase: 'executing',
            action: step.action,
            input: step.parameters,
            output: stepResult.output,
            durationMs: stepResult.durationMs,
            success: stepResult.success,
            error: stepResult.error,
            retryAttempt: stepResult.retryAttempts,
            memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          };
          
          timeline.push(entry);
          this.activeTimelines.get(replayManifest.id)?.push(entry);

          if (stepResult.success) {
            stepsExecuted++;
          } else {
            stepsFailed++;
          }

          // Check for divergences from original execution
          if (originalEntry) {
            if (originalEntry.success !== stepResult.success) {
              divergences.push({
                stepId: step.id,
                field: 'success',
                originalValue: originalEntry.success,
                replayValue: stepResult.success,
                severity: 'warning',
              });
            }
            if (originalEntry.error !== stepResult.error) {
              divergences.push({
                stepId: step.id,
                field: 'error',
                originalValue: originalEntry.error,
                replayValue: stepResult.error,
                severity: originalEntry.error || stepResult.error ? 'warning' : 'info',
              });
            }
          }

          if (options.debugMode) {
            log.info(`[TrinityFabric][Replay Debug] Step ${step.id}: ${stepResult.success ? 'SUCCESS' : 'FAILED'}`);
          }
        }

        replayManifest.completedAt = new Date();
        replayManifest.phase = stepsFailed > 0 ? 'failed' : 'completed';
      }

      // Update recording metadata
      recording.replayCount++;
      recording.lastReplayedAt = new Date();
      recording.lastReplayResult = stepsFailed > 0 ? 'failure' : (stepsSkipped > 0 ? 'partial' : 'success');

      const result: ReplayResult = {
        replayId,
        recordingId,
        success: stepsFailed === 0,
        stepsExecuted,
        stepsSkipped,
        stepsFailed,
        durationMs: Date.now() - startTime,
        timeline,
        divergences,
      };

      log.info(`[TrinityFabric] Replay ${replayId} completed: ${stepsExecuted} executed, ${stepsFailed} failed, ${divergences.length} divergences`);

      // Publish event
      platformEventBus.publish('ai_brain_action', {
        action: 'execution_replayed',
        replayId,
        recordingId,
        success: result.success,
        stepsExecuted,
        stepsFailed,
        divergenceCount: divergences.length,
      });

      return result;

    } catch (error) {
      replayError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[TrinityFabric] Replay ${replayId} failed:`, replayError);

      return {
        replayId,
        recordingId,
        success: false,
        stepsExecuted,
        stepsSkipped,
        stepsFailed,
        durationMs: Date.now() - startTime,
        timeline,
        divergences,
        error: replayError,
      };
    }
  }

  /**
   * Add a timeline entry during step execution
   * Called internally to build execution timeline
   */
  private recordTimelineEntry(
    manifestId: string,
    entry: ExecutionTimelineEntry
  ): void {
    if (!this.activeTimelines.has(manifestId)) {
      this.activeTimelines.set(manifestId, []);
    }
    this.activeTimelines.get(manifestId)!.push(entry);
  }

  /**
   * Capture current environment state for recording
   */
  private captureEnvironmentSnapshot(): EnvironmentSnapshot {
    const memoryUsage = process.memoryUsage();
    return {
      timestamp: new Date(),
      nodeVersion: process.version,
      platform: process.platform,
      activeManifestCount: this.activeManifests.size,
      memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      configHash: crypto.createHash('md5')
        .update(JSON.stringify({
          adapters: Array.from(capabilityAdapters.keys()),
          manifestCount: this.activeManifests.size,
        }))
        .digest('hex').substring(0, 8),
    };
  }

  /**
   * Cleanup old recordings based on retention policy
   */
  private cleanupOldRecordings(): void {
    const now = new Date();
    const retentionMs = this.RECORDING_RETENTION_HOURS * 60 * 60 * 1000;
    
    const recordingsArray = Array.from(this.executionRecordings.entries());
    
    // Remove expired recordings
    for (const [id, recording] of recordingsArray) {
      const age = now.getTime() - recording.recordedAt.getTime();
      if (age > retentionMs) {
        this.executionRecordings.delete(id);
        log.info(`[TrinityFabric] Cleaned up expired recording ${id}`);
      }
    }

    // Enforce max recordings limit
    if (this.executionRecordings.size > this.MAX_RECORDINGS) {
      const sorted = recordingsArray.sort((a, b) => 
        a[1].recordedAt.getTime() - b[1].recordedAt.getTime()
      );
      const toRemove = sorted.slice(0, this.executionRecordings.size - this.MAX_RECORDINGS);
      for (const [id] of toRemove) {
        this.executionRecordings.delete(id);
        log.info(`[TrinityFabric] Cleaned up old recording ${id} (max limit)`);
      }
    }
  }

  /**
   * Get a recording by ID
   */
  getRecording(recordingId: string): ExecutionRecording | undefined {
    return this.executionRecordings.get(recordingId);
  }

  /**
   * Get all recordings for a manifest
   */
  getRecordingsForManifest(manifestId: string): ExecutionRecording[] {
    return Array.from(this.executionRecordings.values())
      .filter(r => r.manifestId === manifestId);
  }

  /**
   * Get recent recordings with optional filtering
   */
  getRecentRecordings(options?: {
    limit?: number;
    reason?: ExecutionRecording['reason'];
    workspaceId?: string;
  }): ExecutionRecording[] {
    let recordings = Array.from(this.executionRecordings.values());
    
    if (options?.reason) {
      recordings = recordings.filter(r => r.reason === options.reason);
    }
    if (options?.workspaceId) {
      recordings = recordings.filter(r => r.manifest.workspaceId === options.workspaceId);
    }
    
    recordings.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
    
    return recordings.slice(0, options?.limit ?? 20);
  }

  /**
   * Get execution timeline for a manifest
   */
  getExecutionTimeline(manifestId: string): ExecutionTimelineEntry[] {
    return this.activeTimelines.get(manifestId) || [];
  }

  /**
   * Export recording for external storage/analysis
   */
  exportRecording(recordingId: string): string | null {
    const recording = this.executionRecordings.get(recordingId);
    if (!recording) return null;
    
    return JSON.stringify(recording, null, 2);
  }

  /**
   * Import a recording from external source
   */
  importRecording(recordingJson: string): ExecutionRecording {
    let recording: ExecutionRecording;
    try {
      recording = JSON.parse(recordingJson);
    } catch {
      throw new Error('Invalid recording JSON format');
    }
    
    recording.recordingId = `rec-imported-${crypto.randomUUID()}`;
    recording.recordedAt = new Date(recording.recordedAt);
    
    this.executionRecordings.set(recording.recordingId, recording);
    
    log.info(`[TrinityFabric] Imported recording as ${recording.recordingId}`);
    
    return recording;
  }

  // ============================================================================
  // PHASE 1: PLANNING - Analyze intent and create execution plan
  // ============================================================================

  async planExecution(
    intent: string,
    context: ExecutionContext,
    options?: {
      domain?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      dryRun?: boolean;
    }
  ): Promise<ExecutionManifest> {
    const manifestId = crypto.randomUUID();
    log.info(`[TrinityFabric] Planning execution: ${manifestId} - "${intent.substring(0, 50)}..."`);
    
    // Start thinking process
    const thinking = await this.startThinking(manifestId, 'planning');
    
    try {
      // Analyze the intent using knowledge orchestration
      const routingDecision = await knowledgeOrchestrationService.routeQuery(intent, {
        userId: context.userId,
        userRole: context.userRole,
        workspaceId: context.workspaceId,
      });
      
      thinking.thoughts.push({
        step: 1,
        type: 'analysis',
        content: `Intent analysis complete. Domain: ${routingDecision.reasoning}`,
        confidence: routingDecision.confidenceScore,
      });
      
      // Determine required capabilities
      const capabilities = this.inferCapabilities(intent, routingDecision.suggestedTools);
      
      thinking.thoughts.push({
        step: 2,
        type: 'observation',
        content: `Required capabilities: ${capabilities.join(', ')}`,
        confidence: 0.85,
      });
      
      // Build execution steps
      const steps = await this.buildExecutionSteps(intent, capabilities, context);
      
      // Build preflight checks
      const preflightChecks = this.buildPreflightChecks(steps, context);
      
      // Build postflight validations
      const postflightValidations = this.buildPostflightValidations(steps);
      
      thinking.conclusion = `Execution plan created with ${steps.length} steps`;
      thinking.confidence = 0.9;
      thinking.phase = 'deciding';
      
      const manifest: ExecutionManifest = {
        id: manifestId,
        name: `Execution: ${intent.substring(0, 50)}`,
        description: intent,
        intent,
        domain: options?.domain || routingDecision.reasoning.split(' ')[0] || 'general',
        priority: options?.priority || 'normal',
        steps,
        currentStep: 0,
        phase: 'planning',
        workspaceId: context.workspaceId,
        userId: context.userId,
        conversationId: context.conversationId,
        preflightChecks,
        postflightValidations,
        createdAt: new Date(),
        stepResults: [],
        rollbackSteps: [],
        canRollback: true,
      };
      
      this.activeManifests.set(manifestId, manifest);
      
      log.info(`[TrinityFabric] Plan created: ${steps.length} steps, ${preflightChecks.length} preflight checks`);
      
      return manifest;
      
    } catch (error) {
      log.error(`[TrinityFabric] Planning failed:`, error);
      throw error;
    }
  }

  // ============================================================================
  // PHASE 2: PREPARATION - Run preflight checks
  // ============================================================================

  async prepareExecution(manifestId: string): Promise<{
    ready: boolean;
    preflightResults: PreflightResult[];
    blockers: string[];
    warnings: string[];
  }> {
    const manifest = this.activeManifests.get(manifestId);
    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }
    
    log.info(`[TrinityFabric] Preparing execution: ${manifestId}`);
    manifest.phase = 'preparing';
    
    const preflightResults: PreflightResult[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];
    
    for (const check of manifest.preflightChecks) {
      try {
        const result = await check.check();
        preflightResults.push(result);
        
        if (!result.passed) {
          if (check.required) {
            blockers.push(`${check.name}: ${result.message}`);
          } else {
            warnings.push(`${check.name}: ${result.message}`);
          }
        }
        
        if (result.warnings) {
          warnings.push(...result.warnings);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        blockers.push(`${check.name} failed: ${errorMessage}`);
      }
    }
    
    const ready = blockers.length === 0;
    
    if (!ready) {
      manifest.phase = 'failed';
      manifest.error = `Preflight checks failed: ${blockers.join(', ')}`;
    }
    
    log.info(`[TrinityFabric] Preparation ${ready ? 'successful' : 'blocked'}: ${blockers.length} blockers, ${warnings.length} warnings`);
    
    return { ready, preflightResults, blockers, warnings };
  }

  // ============================================================================
  // PHASE 3: EXECUTION - Run the execution steps
  // ============================================================================

  async executeManifest(manifestId: string): Promise<{
    success: boolean;
    results: StepResult[];
    error?: string;
    durationMs: number;
  }> {
    const manifest = this.activeManifests.get(manifestId);
    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }
    
    log.info(`[TrinityFabric] Executing manifest: ${manifestId} (${manifest.steps.length} steps)`);
    manifest.phase = 'executing';
    manifest.startedAt = new Date();
    
    const startTime = Date.now();
    const results: StepResult[] = [];
    
    const context: ExecutionContext = {
      workspaceId: manifest.workspaceId,
      userId: manifest.userId,
      userRole: 'org_owner',
      conversationId: manifest.conversationId,
      creditsAvailable: 100,
      permissions: ['*'],
    };
    
    try {
      for (let i = 0; i < manifest.steps.length; i++) {
        const step = manifest.steps[i];
        manifest.currentStep = i;
        
        // Check dependencies
        if (step.dependsOn && step.dependsOn.length > 0) {
          const dependencyResults = results.filter(r => step.dependsOn!.includes(r.stepId));
          const allDependenciesPassed = dependencyResults.every(r => r.success);
          if (!allDependenciesPassed) {
            step.status = 'skipped';
            results.push({
              stepId: step.id,
              success: false,
              output: null,
              error: 'Dependencies not satisfied',
              durationMs: 0,
              retryAttempts: 0,
            });
            continue;
          }
        }
        
        const stepResult = await this.executeStep(step, context, manifest);
        results.push(stepResult);
        
        // Record timeline entry for audit-grade replay
        this.recordTimelineEntry(manifestId, {
          timestamp: new Date(),
          stepId: step.id,
          phase: manifest.phase,
          action: step.action,
          input: step.parameters,
          output: stepResult.output,
          durationMs: stepResult.durationMs,
          success: stepResult.success,
          error: stepResult.error,
          retryAttempt: stepResult.retryAttempts,
          memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        });
        
        // Create rollback step if adapter supports it
        const adapter = capabilityAdapters.get(step.capability);
        if (adapter?.createRollback && stepResult.success) {
          const rollback = adapter.createRollback(step.parameters, stepResult.output);
          if (rollback) {
            manifest.rollbackSteps.push(rollback);
          }
        }
        
        if (!stepResult.success && step.retryCount >= step.maxRetries) {
          manifest.phase = 'failed';
          manifest.error = stepResult.error;
          break;
        }
      }
      
      manifest.stepResults = results;
      const durationMs = Date.now() - startTime;
      
      const success = results.every(r => r.success || manifest.steps.find(s => s.id === r.stepId)?.status === 'skipped');
      
      if (success) {
        manifest.phase = 'validating';
      } else {
        // Auto-record failed executions for audit and replay
        try {
          await this.recordExecution(manifestId, context, 'failure');
        } catch (recordError) {
          log.error(`[TrinityFabric] Failed to record execution for replay:`, recordError);
        }
      }
      
      log.info(`[TrinityFabric] Execution ${success ? 'completed' : 'failed'} in ${durationMs}ms`);
      
      return { success, results, durationMs, error: manifest.error };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      manifest.phase = 'failed';
      manifest.error = errorMessage;
      
      return {
        success: false,
        results,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeStep(
    step: ExecutionStep,
    context: ExecutionContext,
    manifest: ExecutionManifest
  ): Promise<StepResult> {
    const adapter = capabilityAdapters.get(step.capability);
    if (!adapter) {
      return {
        stepId: step.id,
        success: false,
        output: null,
        error: `Unknown capability: ${step.capability}`,
        durationMs: 0,
        retryAttempts: 0,
      };
    }
    
    step.status = 'running';
    step.startedAt = new Date();
    const startTime = Date.now();
    
    let lastError: string | undefined;
    
    for (let attempt = 0; attempt <= step.maxRetries; attempt++) {
      step.retryCount = attempt;
      
      try {
        // Validate parameters
        const isValid = await adapter.validate(step.parameters);
        if (!isValid) {
          throw new Error('Invalid parameters');
        }
        
        // Execute with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Step timeout')), step.timeout)
        );
        
        const result = await Promise.race([
          adapter.execute(step.parameters, context),
          timeoutPromise,
        ]);
        
        step.status = 'completed';
        step.completedAt = new Date();
        step.result = result;
        step.durationMs = Date.now() - startTime;
        
        return {
          stepId: step.id,
          success: true,
          output: result,
          durationMs: step.durationMs,
          retryAttempts: attempt,
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        log.warn(`[TrinityFabric] Step ${step.id} attempt ${attempt + 1} failed: ${lastError}`);
        
        if (attempt < step.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    step.status = 'failed';
    step.error = lastError;
    step.completedAt = new Date();
    step.durationMs = Date.now() - startTime;
    
    return {
      stepId: step.id,
      success: false,
      output: null,
      error: lastError,
      durationMs: step.durationMs,
      retryAttempts: step.retryCount,
    };
  }

  // ============================================================================
  // PHASE 4: VALIDATION - Run postflight validations
  // ============================================================================

  async validateExecution(manifestId: string): Promise<{
    passed: boolean;
    validationResults: ValidationResult[];
    issues: string[];
    suggestions: string[];
  }> {
    const manifest = this.activeManifests.get(manifestId);
    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }
    
    log.info(`[TrinityFabric] Validating execution: ${manifestId}`);
    
    const validationResults: ValidationResult[] = [];
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    for (const validation of manifest.postflightValidations) {
      try {
        const result = await validation.validate(manifest.stepResults);
        validationResults.push(result);
        
        if (!result.passed) {
          issues.push(`${validation.name}: ${result.message}`);
        }
        
        if (result.issues) {
          issues.push(...result.issues);
        }
        
        if (result.suggestions) {
          suggestions.push(...result.suggestions);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        issues.push(`${validation.name} error: ${errorMessage}`);
      }
    }
    
    const passed = issues.length === 0;
    
    if (passed) {
      manifest.phase = 'completed';
      manifest.completedAt = new Date();
      manifest.finalResult = {
        success: true,
        stepResults: manifest.stepResults,
      };
    }
    
    // Learn from execution
    await this.learnFromExecution(manifest, passed);
    
    // Move to history
    this.executionHistory.push(manifest);
    this.activeManifests.delete(manifestId);
    
    log.info(`[TrinityFabric] Validation ${passed ? 'passed' : 'failed'}: ${issues.length} issues`);
    
    return { passed, validationResults, issues, suggestions };
  }

  // ============================================================================
  // ROLLBACK - Undo executed steps
  // ============================================================================

  async rollbackExecution(manifestId: string): Promise<{
    success: boolean;
    rolledBackSteps: string[];
    errors: string[];
  }> {
    const manifest = this.activeManifests.get(manifestId) || 
                     this.executionHistory.find(m => m.id === manifestId);
    
    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }
    
    if (!manifest.canRollback || manifest.rollbackSteps.length === 0) {
      return { success: false, rolledBackSteps: [], errors: ['No rollback steps available'] };
    }
    
    log.info(`[TrinityFabric] Rolling back execution: ${manifestId}`);
    manifest.phase = 'rolled_back';
    
    const context: ExecutionContext = {
      workspaceId: manifest.workspaceId,
      userId: manifest.userId,
      userRole: 'org_owner',
      creditsAvailable: 100,
      permissions: ['*'],
    };
    
    const rolledBackSteps: string[] = [];
    const errors: string[] = [];
    
    // Execute rollback steps in reverse order
    for (const rollback of manifest.rollbackSteps.reverse()) {
      if (rollback.executed) continue;
      
      try {
        const adapter = capabilityAdapters.get(rollback.rollbackAction as CapabilityType);
        if (adapter) {
          await adapter.execute(rollback.rollbackParams, context);
          rollback.executed = true;
          rolledBackSteps.push(rollback.stepId);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Rollback ${rollback.stepId} failed: ${errorMessage}`);
      }
    }
    
    log.info(`[TrinityFabric] Rollback complete: ${rolledBackSteps.length} steps rolled back`);
    
    return {
      success: errors.length === 0,
      rolledBackSteps,
      errors,
    };
  }

  // ============================================================================
  // THINKING PROCESS - Architect-style reasoning
  // ============================================================================

  private async startThinking(manifestId: string, phase: ThinkingProcess['phase']): Promise<ThinkingProcess> {
    const thinking: ThinkingProcess = {
      id: manifestId,
      phase,
      thoughts: [],
      conclusion: '',
      confidence: 0,
      durationMs: 0,
    };
    
    this.thinkingProcesses.set(manifestId, thinking);
    return thinking;
  }

  async getThinkingProcess(manifestId: string): Promise<ThinkingProcess | undefined> {
    return this.thinkingProcesses.get(manifestId);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private inferCapabilities(intent: string, suggestedTools: string[]): CapabilityType[] {
    const capabilities: CapabilityType[] = [];
    const intentLower = intent.toLowerCase();
    
    // File operations
    if (intentLower.includes('read') || intentLower.includes('view') || intentLower.includes('show')) {
      capabilities.push('file_read');
    }
    if (intentLower.includes('write') || intentLower.includes('create') || intentLower.includes('add')) {
      capabilities.push('file_write');
    }
    if (intentLower.includes('edit') || intentLower.includes('update') || intentLower.includes('modify')) {
      capabilities.push('file_edit');
    }
    
    // Test operations
    if (intentLower.includes('test') || intentLower.includes('validate') || intentLower.includes('check')) {
      capabilities.push('test_run');
      capabilities.push('test_validate');
    }
    
    // Search operations
    if (intentLower.includes('search') || intentLower.includes('find') || intentLower.includes('locate')) {
      capabilities.push('search_code');
    }
    
    // Analysis operations
    if (intentLower.includes('analyze') || intentLower.includes('review') || intentLower.includes('examine')) {
      capabilities.push('analyze_code');
    }
    
    // Workflow operations
    if (intentLower.includes('workflow') || intentLower.includes('automate') || intentLower.includes('run')) {
      capabilities.push('execute_workflow');
    }
    
    // AI operations
    if (intentLower.includes('think') || intentLower.includes('reason') || intentLower.includes('ai')) {
      capabilities.push('call_ai_model');
    }
    
    // Default to AI if no specific capability found
    if (capabilities.length === 0) {
      capabilities.push('call_ai_model');
    }
    
    return capabilities;
  }

  private async buildExecutionSteps(
    intent: string,
    capabilities: CapabilityType[],
    context: ExecutionContext
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];
    let order = 0;
    
    for (const capability of capabilities) {
      const step: ExecutionStep = {
        id: crypto.randomUUID(),
        order: order++,
        capability,
        action: `Execute ${capability}`,
        parameters: this.inferParameters(capability, intent),
        timeout: 30000,
        retryCount: 0,
        maxRetries: 2,
        status: 'pending',
      };
      
      steps.push(step);
    }
    
    return steps;
  }

  private inferParameters(capability: CapabilityType, intent: string): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Extract file paths
    const pathMatch = intent.match(/['"]([^'"]+\.(ts|js|tsx|jsx|json|md|css|html))['"]/);
    if (pathMatch) {
      params.path = pathMatch[1];
    }
    
    // Extract search patterns
    const searchMatch = intent.match(/search\s+(?:for\s+)?['"]?([^'"]+?)['"]?\s/i);
    if (searchMatch) {
      params.pattern = searchMatch[1];
    }
    
    // Default parameters
    switch (capability) {
      case 'test_run':
        params.category = 'all';
        break;
      case 'test_validate':
        params.limit = 10;
        break;
      case 'call_ai_model':
        params.prompt = intent;
        break;
    }
    
    return params;
  }

  private buildPreflightChecks(steps: ExecutionStep[], context: ExecutionContext): PreflightCheck[] {
    const checks: PreflightCheck[] = [];
    
    // Permission check
    checks.push({
      id: 'permission_check',
      name: 'Permission Validation',
      type: 'permission',
      required: true,
      check: async () => ({
        passed: context.permissions.includes('*') || context.permissions.length > 0,
        message: 'User has required permissions',
        canProceed: true,
      }),
    });
    
    // Credit check
    checks.push({
      id: 'credit_check',
      name: 'Credit Availability',
      type: 'credit',
      required: true,
      check: async () => {
        const estimatedCost = steps.reduce((sum, step) => {
          const adapter = capabilityAdapters.get(step.capability);
          return sum + (adapter?.estimateCost(step.parameters) || 0);
        }, 0);
        
        return {
          passed: context.creditsAvailable >= estimatedCost,
          message: `Estimated cost: ${estimatedCost} credits, Available: ${context.creditsAvailable}`,
          canProceed: context.creditsAvailable >= estimatedCost,
        };
      },
    });
    
    return checks;
  }

  private buildPostflightValidations(steps: ExecutionStep[]): PostflightValidation[] {
    return [
      {
        id: 'all_steps_completed',
        name: 'Step Completion Check',
        type: 'state',
        validate: async (results: StepResult[]) => {
          const allCompleted = results.every(r => r.success);
          return {
            passed: allCompleted,
            message: allCompleted ? 'All steps completed successfully' : 'Some steps failed',
            issues: results.filter(r => !r.success).map(r => r.error || 'Unknown error'),
          };
        },
      },
    ];
  }

  private async learnFromExecution(manifest: ExecutionManifest, success: boolean): Promise<void> {
    try {
      // Record learning entry
      const learningEntry = {
        manifestId: manifest.id,
        intent: manifest.intent,
        domain: manifest.domain,
        success,
        stepsCount: manifest.steps.length,
        duration: manifest.completedAt && manifest.startedAt 
          ? manifest.completedAt.getTime() - manifest.startedAt.getTime()
          : 0,
        capabilities: manifest.steps.map(s => s.capability),
        timestamp: new Date(),
      };
      
      log.info(`[TrinityFabric] Learning recorded:`, JSON.stringify(learningEntry));
      
      // Share insight with Trinity Memory
      if (success) {
        await trinityMemoryService.shareInsight({
          sourceAgent: 'trinity',
          insightType: 'resolution',
          workspaceScope: manifest.workspaceId,
          title: `Successful execution: ${manifest.name}`,
          content: `Completed ${manifest.steps.length} steps in ${manifest.domain} domain`,
          confidence: 0.9,
          applicableScenarios: [manifest.intent],
        });
      }
    } catch (error) {
      log.error(`[TrinityFabric] Failed to record learning:`, error);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  async executeIntent(
    intent: string,
    context: ExecutionContext,
    options?: {
      domain?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      autoValidate?: boolean;
      autoRollbackOnFailure?: boolean;
    }
  ): Promise<{
    manifestId: string;
    success: boolean;
    phase: ExecutionPhase;
    results?: StepResult[];
    thinking?: ThinkingProcess;
    error?: string;
  }> {
    try {
      // Phase 1: Plan
      const manifest = await this.planExecution(intent, context, options);
      
      // Phase 2: Prepare
      const preparation = await this.prepareExecution(manifest.id);
      if (!preparation.ready) {
        return {
          manifestId: manifest.id,
          success: false,
          phase: 'failed',
          error: `Preflight failed: ${preparation.blockers.join(', ')}`,
        };
      }
      
      // Phase 3: Execute
      const execution = await this.executeManifest(manifest.id);
      if (!execution.success) {
        if (options?.autoRollbackOnFailure) {
          await this.rollbackExecution(manifest.id);
        }
        return {
          manifestId: manifest.id,
          success: false,
          phase: manifest.phase,
          results: execution.results,
          error: execution.error,
        };
      }
      
      // Phase 4: Validate
      if (options?.autoValidate !== false) {
        const validation = await this.validateExecution(manifest.id);
        if (!validation.passed) {
          if (options?.autoRollbackOnFailure) {
            await this.rollbackExecution(manifest.id);
          }
          return {
            manifestId: manifest.id,
            success: false,
            phase: 'failed',
            results: execution.results,
            error: `Validation failed: ${validation.issues.join(', ')}`,
          };
        }
      }
      
      const thinking = await this.getThinkingProcess(manifest.id);
      
      return {
        manifestId: manifest.id,
        success: true,
        phase: 'completed',
        results: execution.results,
        thinking,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        manifestId: '',
        success: false,
        phase: 'failed',
        error: errorMessage,
      };
    }
  }

  getActiveManifests(): ExecutionManifest[] {
    return Array.from(this.activeManifests.values());
  }

  getExecutionHistory(limit: number = 50): ExecutionManifest[] {
    return this.executionHistory.slice(-limit);
  }

  getManifest(manifestId: string): ExecutionManifest | undefined {
    return this.activeManifests.get(manifestId) || 
           this.executionHistory.find(m => m.id === manifestId);
  }
}

export const trinityExecutionFabric = TrinityExecutionFabric.getInstance();
