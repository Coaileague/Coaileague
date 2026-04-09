/**
 * TRINITY UNIFIED TASK SCHEMA
 * ===========================
 * Canonical task contract for all Trinity AI Brain operations.
 * 
 * This schema solves the "Unified Task Schema" critical gap:
 * - Standardizes task representation across all subagents
 * - Enables reliable task chaining and progress tracking
 * - Provides foundation for State Machine Governance
 * 
 * Architecture:
 * - TrinityTask: Core task entity persisted to database
 * - TrinityTaskStep: Individual steps within a task
 * - TrinityToolCall: Tool invocations with RBAC context
 * - TrinityTaskOutput: Standardized output format
 */

import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import { pgTable, varchar, text, jsonb, timestamp, integer, boolean, index, pgEnum } from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS - Task Lifecycle States
// ============================================================================

export const trinityTaskStatusEnum = pgEnum('trinity_task_status', [
  'pending',        // Task created, not yet started
  'planning',       // Plan creation in progress
  'plan_ready',     // Plan created, awaiting approval or execution
  'executing',      // Steps being executed
  'validating',     // Post-execution validation
  'reflecting',     // Self-reflection cycle
  'completed',      // Task successfully completed
  'failed',         // Task failed after retries
  'escalated',      // Escalated to human
  'cancelled',      // Cancelled by user or system
]);

export const trinityTaskPhaseEnum = pgEnum('trinity_task_phase', [
  'intake',         // Receiving and parsing user intent
  'plan',           // Creating execution plan
  'preflight',      // Pre-flight safety checks
  'act',            // Executing plan steps
  'validate',       // Validating execution results
  'reflect',        // Self-reflection and learning
  'commit',         // Committing changes
  'report',         // Generating completion report
]);

export const trinityStepStatusEnum = pgEnum('trinity_step_status', [
  'pending',        // Step not yet started
  'in_progress',    // Step currently executing
  'completed',      // Step completed successfully
  'failed',         // Step failed
  'skipped',        // Step skipped (dependency failed)
  'retrying',       // Step being retried
]);

export const trinityRiskLevelEnum = pgEnum('trinity_risk_level', [
  'low',
  'medium',
  'high',
  'critical',
]);

// ============================================================================
// ZOD SCHEMAS - Validation and Type Safety
// ============================================================================

export const TrinityIntentSchema = z.object({
  rawInput: z.string(),
  parsedGoal: z.string(),
  domain: z.string().optional(),
  entities: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1),
});
export type TrinityIntent = z.infer<typeof TrinityIntentSchema>;

export const TrinityToolCallSchema = z.object({
  toolId: z.string(),
  toolName: z.string(),
  action: z.string(),
  parameters: z.record(z.any()),
  rbacContext: z.object({
    requiredRole: z.string(),
    callerRole: z.string(),
    workspaceId: z.string(),
    userId: z.string(),
    authorized: z.boolean(),
    bypassReason: z.string().optional(),
  }),
  result: z.any().optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
  timestamp: z.string().optional(),
});
export type TrinityToolCall = z.infer<typeof TrinityToolCallSchema>;

export const TrinityTaskStepSchema = z.object({
  stepId: z.string(),
  order: z.number(),
  action: z.string(),
  description: z.string(),
  subagent: z.string().optional(),
  parameters: z.record(z.any()),
  dependsOn: z.array(z.string()).default([]),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped', 'retrying']),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedDurationMs: z.number().optional(),
  estimatedCredits: z.number().optional(),
  successCriteria: z.array(z.string()).optional(),
  toolCalls: z.array(TrinityToolCallSchema).default([]),
  output: z.any().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  verified: z.boolean().default(false),
  verificationResult: z.object({
    passed: z.boolean(),
    type: z.string(),
    details: z.string(),
    errors: z.array(z.string()).optional(),
  }).optional(),
});
export type TrinityTaskStep = z.infer<typeof TrinityTaskStepSchema>;

export const TrinityReflectionSchema = z.object({
  reflectionId: z.string(),
  cycleNumber: z.number(),
  executionQuality: z.number().min(0).max(1),
  goalAlignment: z.number().min(0).max(1),
  issuesFound: z.array(z.string()),
  suggestedRevisions: z.array(z.object({
    stepId: z.string(),
    description: z.string(),
    newParameters: z.record(z.any()).optional(),
  })),
  lessonsLearned: z.array(z.string()),
  shouldRetry: z.boolean(),
  timestamp: z.string(),
});
export type TrinityReflection = z.infer<typeof TrinityReflectionSchema>;

export const TrinityTaskOutputSchema = z.object({
  success: z.boolean(),
  summary: z.string(),
  changes: z.array(z.object({
    type: z.enum(['file_created', 'file_modified', 'file_deleted', 'database_change', 'api_call', 'notification_sent', 'other']),
    target: z.string(),
    description: z.string(),
    rollbackable: z.boolean(),
  })),
  artifacts: z.array(z.object({
    type: z.string(),
    name: z.string(),
    path: z.string().optional(),
    content: z.any().optional(),
  })).optional(),
  metrics: z.object({
    stepsCompleted: z.number(),
    stepsTotal: z.number(),
    durationMs: z.number(),
    creditsUsed: z.number(),
    reflectionCycles: z.number(),
    autoCorrections: z.number(),
  }),
});
export type TrinityTaskOutput = z.infer<typeof TrinityTaskOutputSchema>;

export const TrinityStateTransitionSchema = z.object({
  fromStatus: z.string(),
  toStatus: z.string(),
  fromPhase: z.string().optional(),
  toPhase: z.string().optional(),
  reason: z.string(),
  triggeredBy: z.enum(['system', 'user', 'ai', 'timeout', 'error']),
  timestamp: z.string(),
  metadata: z.record(z.any()).optional(),
});
export type TrinityStateTransition = z.infer<typeof TrinityStateTransitionSchema>;

// Main Task Schema
export const TrinityTaskSchema = z.object({
  taskId: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  
  // Intent
  intent: TrinityIntentSchema,
  
  // Status and Phase (for state machine)
  status: z.enum([
    'pending', 'planning', 'plan_ready', 'executing', 
    'validating', 'reflecting', 'completed', 'failed', 
    'escalated', 'cancelled'
  ]),
  phase: z.enum([
    'intake', 'plan', 'preflight', 'act', 
    'validate', 'reflect', 'commit', 'report'
  ]),
  
  // Plan
  planId: z.string().optional(),
  framework: z.enum(['chain_of_thought', 'react', 'tree_of_thought', 'decomposition']).optional(),
  steps: z.array(TrinityTaskStepSchema).default([]),
  currentStepIndex: z.number().default(0),
  
  // Confidence tracking
  overallConfidence: z.number().min(0).max(1).default(1),
  stepConfidences: z.record(z.number()).default({}),
  
  // Reflection
  reflections: z.array(TrinityReflectionSchema).default([]),
  maxReflectionCycles: z.number().default(3),
  
  // State transitions (audit trail)
  stateHistory: z.array(TrinityStateTransitionSchema).default([]),
  
  // Output
  output: TrinityTaskOutputSchema.optional(),
  
  // Escalation
  escalatedAt: z.string().optional(),
  escalationReason: z.string().optional(),
  escalatedToUserId: z.string().optional(),
  
  // Timing
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  timeoutMs: z.number().default(300000), // 5 minute default
  
  // Context
  contextSnapshot: z.object({
    relevantFiles: z.array(z.string()).optional(),
    relevantComponents: z.array(z.string()).optional(),
    specContext: z.any().optional(),
    memoryContext: z.any().optional(),
  }).optional(),
  
  // Credits
  estimatedCredits: z.number().optional(),
  actualCreditsUsed: z.number().default(0),
  
  // Parent/child relationships
  parentTaskId: z.string().optional(),
  childTaskIds: z.array(z.string()).default([]),
  
  // Subagent routing
  primarySubagent: z.string().optional(),
  involvedSubagents: z.array(z.string()).default([]),
});
export type TrinityTask = z.infer<typeof TrinityTaskSchema>;
// ============================================================================
// CONVERSION UTILITIES - Bridge Legacy Formats
// ============================================================================

/**
 * Convert from SubagentExecutionContext to TrinityTask
 */
export function fromSubagentContext(ctx: {
  executionId: string;
  subagentId: string;
  domain: string;
  actionId: string;
  userId: string;
  workspaceId: string;
  parameters: Record<string, any>;
  startedAt: Date;
}): Partial<TrinityTask> {
  return {
    taskId: ctx.executionId,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    intent: {
      rawInput: ctx.actionId,
      parsedGoal: ctx.actionId,
      domain: ctx.domain,
      entities: ctx.parameters,
      confidence: 1,
    },
    status: 'executing',
    phase: 'act',
    primarySubagent: ctx.subagentId,
    involvedSubagents: [ctx.subagentId],
    createdAt: ctx.startedAt.toISOString(),
    startedAt: ctx.startedAt.toISOString(),
  };
}

/**
 * Convert from AgentExecutionContext (parity layer) to TrinityTask
 */
export function fromAgentExecutionContext(ctx: {
  executionId: string;
  workspaceId: string;
  userId: string;
  goal: string;
  plan?: any;
  overallConfidence: number;
  currentStep: number;
  executedSteps: any[];
  pendingSteps: any[];
  reflectionCycles: number;
  relevantFiles: string[];
  relevantComponents: string[];
}): Partial<TrinityTask> {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const steps: TrinityTaskStep[] = [
    ...ctx.executedSteps.map((s, i) => ({
      stepId: s.stepId || `step-${i}`,
      order: i,
      action: s.action,
      description: s.action,
      parameters: s.input || {},
      dependsOn: [],
      status: s.success ? 'completed' : 'failed' as const,
      riskLevel: 'low' as const,
      toolCalls: [],
      output: s.output,
      error: s.error,
      startedAt: s.timestamp?.toISOString(),
      completedAt: s.timestamp?.toISOString(),
      retryCount: 0,
      maxRetries: 3,
      verified: s.verified || false,
      verificationResult: s.verificationResult,
    })),
    ...ctx.pendingSteps.map((s, i) => ({
      stepId: s.stepId || `pending-${i}`,
      order: ctx.executedSteps.length + i,
      action: s.action,
      description: s.description || s.action,
      parameters: s.parameters || {},
      dependsOn: s.dependsOn || [],
      status: 'pending' as const,
      riskLevel: (s.riskLevel || 'low') as 'low' | 'medium' | 'high' | 'critical',
      toolCalls: [],
      retryCount: 0,
      maxRetries: s.maxRetries || 3,
      verified: false,
    })),
  ];

  return {
    taskId: ctx.executionId,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    intent: {
      rawInput: ctx.goal,
      parsedGoal: ctx.goal,
      confidence: ctx.overallConfidence,
    },
    status: ctx.pendingSteps.length > 0 ? 'executing' : 'completed',
    phase: ctx.pendingSteps.length > 0 ? 'act' : 'report',
    planId: ctx.plan?.planId,
    framework: ctx.plan?.framework,
    steps,
    currentStepIndex: ctx.currentStep,
    overallConfidence: ctx.overallConfidence,
    contextSnapshot: {
      relevantFiles: ctx.relevantFiles,
      relevantComponents: ctx.relevantComponents,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convert from ExecutionPlan (planning framework) to TrinityTask steps
 */
export function stepsFromExecutionPlan(plan: {
  planId: string;
  steps: Array<{
    stepId: string;
    order: number;
    action: string;
    description: string;
    subagent?: string;
    parameters: Record<string, any>;
    dependsOn: string[];
    estimatedDurationMs: number;
    estimatedCredits: number;
    riskLevel: string;
    canFail: boolean;
    successCriteria: string[];
  }>;
  confidence: number;
  framework: string;
}): TrinityTaskStep[] {
  return plan.steps.map(s => ({
    stepId: s.stepId,
    order: s.order,
    action: s.action,
    description: s.description,
    subagent: s.subagent,
    parameters: s.parameters,
    dependsOn: s.dependsOn,
    status: 'pending' as const,
    riskLevel: (s.riskLevel || 'low') as 'low' | 'medium' | 'high' | 'critical',
    estimatedDurationMs: s.estimatedDurationMs,
    estimatedCredits: s.estimatedCredits,
    successCriteria: s.successCriteria,
    toolCalls: [],
    retryCount: 0,
    maxRetries: s.canFail ? 3 : 1,
    verified: false,
  }));
}

/**
 * Convert TrinityTask to SubagentExecutionResult format
 */
export function toSubagentExecutionResult(task: TrinityTask): {
  success: boolean;
  phase: string;
  status: string;
  result?: any;
  error?: { code: string; message: string };
  durationMs: number;
  confidenceScore: number;
} {
  const startTime = task.startedAt ? new Date(task.startedAt).getTime() : Date.now();
  const endTime = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
  
  return {
    success: task.status === 'completed',
    phase: task.phase,
    status: task.status,
    result: task.output,
    error: task.output?.success === false ? {
      code: 'TASK_FAILED',
      message: task.escalationReason || 'Task failed',
    } : undefined,
    durationMs: endTime - startTime,
    confidenceScore: task.overallConfidence,
  };
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new TrinityTask with sensible defaults
 */
export function createTrinityTask(params: {
  taskId: string;
  workspaceId: string;
  userId: string;
  goal: string;
  domain?: string;
  primarySubagent?: string;
  timeoutMs?: number;
}): TrinityTask {
  const now = new Date().toISOString();
  
  return {
    taskId: params.taskId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    intent: {
      rawInput: params.goal,
      parsedGoal: params.goal,
      domain: params.domain,
      confidence: 1,
    },
    status: 'pending',
    phase: 'intake',
    steps: [],
    currentStepIndex: 0,
    overallConfidence: 1,
    stepConfidences: {},
    reflections: [],
    maxReflectionCycles: 3,
    stateHistory: [{
      fromStatus: '',
      toStatus: 'pending',
      fromPhase: '',
      toPhase: 'intake',
      reason: 'Task created',
      triggeredBy: 'system',
      timestamp: now,
    }],
    createdAt: now,
    timeoutMs: params.timeoutMs || 300000,
    primarySubagent: params.primarySubagent,
    involvedSubagents: params.primarySubagent ? [params.primarySubagent] : [],
    childTaskIds: [],
    actualCreditsUsed: 0,
  };
}
