/**
 * TRINITY WORK ORDER SYSTEM
 * =========================
 * Fortune 500-grade work order intake, decomposition, and execution tracking.
 * Gives Trinity the same understanding capability as an autonomous AI agent.
 * 
 * Capabilities:
 * 1. Work Order Intake - Parse natural language into structured tasks
 * 2. Task Decomposition - Break complex requests into atomic subtasks
 * 3. Solution Discovery Loop - Iterative try/evaluate/retry cycle
 * 4. Confident Commit Protocol - Test before committing
 * 5. Clarification Protocol - Know when to ask vs proceed
 * 6. Work Summary Engine - Report completed work
 */

import { trinityMemoryService } from './trinityMemoryService';
import { selfReflectionEngine } from './selfReflectionEngine';
import { trinityCodeOps } from './trinityCodeOps';
import { aiBrainTestRunner } from './aiBrainTestRunner';
import { platformEventBus } from '../platformEventBus';
import { geminiClient } from './providers/geminiClient';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import crypto from 'crypto';

import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityWorkOrderSystem');

// ============================================================================
// TYPES - WORK ORDER INTAKE
// ============================================================================

export type WorkOrderIntent = 
  | 'bug_fix'
  | 'feature_request'
  | 'refactor'
  | 'investigation'
  | 'configuration'
  | 'data_operation'
  | 'documentation'
  | 'optimization'
  | 'security_fix'
  | 'integration'
  | 'deployment'
  | 'unknown';

export type WorkOrderUrgency = 'critical' | 'high' | 'medium' | 'low';

export type WorkOrderComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'architect_grade';

export interface WorkOrder {
  id: string;
  workspaceId: string;
  userId: string;
  
  // Original request
  rawRequest: string;
  
  // Parsed understanding
  intent: WorkOrderIntent;
  urgency: WorkOrderUrgency;
  complexity: WorkOrderComplexity;
  
  // Extracted details
  summary: string;
  affectedAreas: string[];
  successCriteria: SuccessCriterion[];
  constraints: string[];
  assumptions: string[];
  
  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  requiresApproval: boolean;
  
  // Clarification needs
  ambiguities: Ambiguity[];
  clarificationRequired: boolean;
  
  // Tracking
  status: WorkOrderStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export type WorkOrderStatus = 
  | 'intake'
  | 'clarifying'
  | 'decomposing'
  | 'executing'
  | 'testing'
  | 'reviewing'
  | 'awaiting_approval'
  | 'committing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SuccessCriterion {
  id: string;
  description: string;
  testable: boolean;
  testMethod?: string;
  priority: 'must' | 'should' | 'could';
}

export interface Ambiguity {
  id: string;
  question: string;
  context: string;
  options?: string[];
  impact: 'blocking' | 'clarifying' | 'preference';
  resolved: boolean;
  resolution?: string;
}

// ============================================================================
// TYPES - TASK DECOMPOSITION
// ============================================================================

export interface TaskNode {
  id: string;
  workOrderId: string;
  parentId?: string;
  
  // Task definition
  title: string;
  description: string;
  actionType: TaskActionType;
  
  // Dependencies
  dependsOn: string[];
  blocks: string[];
  
  // Execution
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  
  // Results
  output?: any;
  error?: string;
  durationMs?: number;
  
  // Metadata
  estimatedMinutes: number;
  confidence: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export type TaskActionType = 
  | 'search_code'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'run_test'
  | 'analyze'
  | 'validate'
  | 'commit'
  | 'ask_user'
  | 'call_api'
  | 'database_query'
  | 'think'
  | 'summarize';

export type TaskStatus = 
  | 'pending'
  | 'ready'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'blocked';

// ============================================================================
// TYPES - SOLUTION DISCOVERY
// ============================================================================

export interface SolutionAttempt {
  id: string;
  workOrderId: string;
  attemptNumber: number;
  
  // Strategy
  approach: string;
  hypothesis: string;
  
  // Execution
  tasksExecuted: string[];
  changesApplied: ChangeRecord[];
  testsRun: string[];
  
  // Evaluation
  success: boolean;
  confidenceScore: number;
  issues: string[];
  reflectionResult?: any;
  
  // Decision
  shouldCommit: boolean;
  shouldRetry: boolean;
  nextApproach?: string;
  
  // Timing
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface ChangeRecord {
  id: string;
  file: string;
  changeType: 'created' | 'modified' | 'deleted';
  diffPreview: string;
  linesAdded: number;
  linesRemoved: number;
  canRollback: boolean;
  rolledBack: boolean;
}

// ============================================================================
// TYPES - COMMIT PROTOCOL
// ============================================================================

export interface CommitDecision {
  shouldCommit: boolean;
  confidenceScore: number;
  
  // Validation results
  testsPass: boolean;
  reflectionPass: boolean;
  noRegressions: boolean;
  
  // Requirements
  meetsCriteria: CriterionResult[];
  unmetCriteria: CriterionResult[];
  
  // Risk assessment
  riskAcceptable: boolean;
  riskMitigations: string[];
  
  // Human review
  requiresHumanReview: boolean;
  reviewReason?: string;
}

export interface CriterionResult {
  criterionId: string;
  description: string;
  met: boolean;
  evidence: string;
}

// ============================================================================
// TYPES - WORK SUMMARY
// ============================================================================

export interface WorkSummary {
  workOrderId: string;
  title: string;
  
  // Overview
  intent: string;
  outcome: 'success' | 'partial' | 'failed' | 'cancelled';
  
  // What was done
  tasksCompleted: number;
  tasksFailed: number;
  attemptsNeeded: number;
  
  // Changes made
  filesModified: number;
  linesAdded: number;
  linesRemoved: number;
  testsPassed: number;
  testsFailed: number;
  
  // Key highlights
  majorChanges: string[];
  risksAddressed: string[];
  knownLimitations: string[];
  
  // Follow-up
  recommendations: string[];
  remainingWork: string[];
  
  // Timing
  totalDurationMs: number;
  humanReadableDuration: string;
}

// ============================================================================
// WORK ORDER INTAKE SERVICE
// ============================================================================

class TrinityWorkOrderIntake {
  private static instance: TrinityWorkOrderIntake;
  private activeWorkOrders: Map<string, WorkOrder> = new Map();
  
  static getInstance(): TrinityWorkOrderIntake {
    if (!this.instance) {
      this.instance = new TrinityWorkOrderIntake();
    }
    return this.instance;
  }

  async parseWorkOrder(
    rawRequest: string,
    workspaceId: string,
    userId: string
  ): Promise<WorkOrder> {
    const workOrderId = crypto.randomUUID();
    const startTime = Date.now();
    
    log.info(`[WorkOrderIntake] Parsing request: "${rawRequest.substring(0, 100)}..."`);
    
    const prompt = `You are an expert work order analyst. Parse this user request into a structured work order.

USER REQUEST:
${rawRequest}

Analyze and extract:
1. INTENT: What type of work is requested? (bug_fix, feature_request, refactor, investigation, configuration, data_operation, documentation, optimization, security_fix, integration, deployment)
2. URGENCY: How urgent is this? (critical, high, medium, low)
3. COMPLEXITY: How complex is the work? (trivial, simple, moderate, complex, architect_grade)
4. SUMMARY: One-sentence description of what needs to be done
5. AFFECTED_AREAS: List of files, systems, or components likely affected
6. SUCCESS_CRITERIA: Measurable outcomes that define "done" (mark each as must/should/could)
7. CONSTRAINTS: Any limitations or requirements mentioned
8. ASSUMPTIONS: What you're assuming to proceed
9. RISK_LEVEL: Overall risk (low, medium, high, critical)
10. RISK_FACTORS: Specific risks to watch for
11. AMBIGUITIES: Questions that need clarification before proceeding (mark as blocking, clarifying, or preference)

Return JSON:
{
  "intent": "...",
  "urgency": "...",
  "complexity": "...",
  "summary": "...",
  "affectedAreas": ["..."],
  "successCriteria": [{"description": "...", "priority": "must|should|could", "testable": true}],
  "constraints": ["..."],
  "assumptions": ["..."],
  "riskLevel": "...",
  "riskFactors": ["..."],
  "ambiguities": [{"question": "...", "context": "...", "impact": "blocking|clarifying|preference"}]
}`;

    try {
      const response = await geminiClient.generate({
        workspaceId,
        userId,
        featureKey: 'work_order_analysis',
        systemPrompt: 'You are an expert work order analyst for the CoAIleague platform.',
        userMessage: prompt,
      });

      const parsed = this.extractJSON(response.text);
      
      const workOrder: WorkOrder = {
        id: workOrderId,
        workspaceId,
        userId,
        rawRequest,
        intent: parsed.intent || 'unknown',
        urgency: parsed.urgency || 'medium',
        complexity: parsed.complexity || 'moderate',
        summary: parsed.summary || rawRequest.substring(0, 100),
        affectedAreas: parsed.affectedAreas || [],
        successCriteria: (parsed.successCriteria || []).map((c: any, i: number) => ({
          id: `sc-${i}`,
          description: c.description,
          testable: c.testable !== false,
          priority: c.priority || 'should',
        })),
        constraints: parsed.constraints || [],
        assumptions: parsed.assumptions || [],
        riskLevel: parsed.riskLevel || 'medium',
        riskFactors: parsed.riskFactors || [],
        requiresApproval: parsed.riskLevel === 'high' || parsed.riskLevel === 'critical',
        ambiguities: (parsed.ambiguities || []).map((a: any, i: number) => ({
          id: `amb-${i}`,
          question: a.question,
          context: a.context || '',
          options: a.options,
          impact: a.impact || 'clarifying',
          resolved: false,
        })),
        clarificationRequired: (parsed.ambiguities || []).some((a: any) => a.impact === 'blocking'),
        status: 'intake',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.activeWorkOrders.set(workOrderId, workOrder);
      
      log.info(`[WorkOrderIntake] Parsed work order ${workOrderId}:`, {
        intent: workOrder.intent,
        complexity: workOrder.complexity,
        criteria: workOrder.successCriteria.length,
        ambiguities: workOrder.ambiguities.length,
        clarificationRequired: workOrder.clarificationRequired,
        durationMs: Date.now() - startTime,
      });
      
      await this.logWorkOrder(workOrder);
      
      return workOrder;
      
    } catch (error: any) {
      log.error('[WorkOrderIntake] Parse failed:', (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  private extractJSON(text: string): any {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return {};
      }
    }
    return {};
  }

  private async logWorkOrder(workOrder: WorkOrder): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: workOrder.workspaceId,
        userId: workOrder.userId,
        action: 'work_order_created',
        entityType: 'work_order',
        entityId: workOrder.id,
        metadata: {
          intent: workOrder.intent,
          complexity: workOrder.complexity,
          summary: workOrder.summary,
          riskLevel: workOrder.riskLevel,
        },
      });
    } catch (error) {
      log.error('[WorkOrderIntake] Failed to log work order:', error);
    }
  }

  getWorkOrder(id: string): WorkOrder | undefined {
    return this.activeWorkOrders.get(id);
  }

  updateStatus(id: string, status: WorkOrderStatus): void {
    const wo = this.activeWorkOrders.get(id);
    if (wo) {
      wo.status = status;
      wo.updatedAt = new Date();
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        wo.completedAt = new Date();
      }
    }
  }
}

// ============================================================================
// TASK DECOMPOSITION ENGINE
// ============================================================================

class TaskDecompositionEngine {
  private static instance: TaskDecompositionEngine;
  private taskGraphs: Map<string, TaskNode[]> = new Map();
  
  static getInstance(): TaskDecompositionEngine {
    if (!this.instance) {
      this.instance = new TaskDecompositionEngine();
    }
    return this.instance;
  }

  async decompose(workOrder: WorkOrder): Promise<TaskNode[]> {
    const startTime = Date.now();
    log.info(`[TaskDecomposition] Decomposing work order ${workOrder.id}...`);
    
    // For simple/trivial complexity, create a minimal task graph
    if (workOrder.complexity === 'trivial') {
      const tasks: TaskNode[] = [{
        id: 'task-1',
        workOrderId: workOrder.id,
        title: 'Execute request',
        description: workOrder.summary,
        actionType: 'analyze',
        dependsOn: [],
        blocks: [],
        status: 'ready', // Mark as ready immediately
        attempts: 0,
        maxAttempts: 3,
        estimatedMinutes: 2,
        confidence: 0.9,
        createdAt: new Date(),
      }];
      this.taskGraphs.set(workOrder.id, tasks);
      return tasks;
    }
    
    const prompt = `You are an expert task planner. Decompose this work order into atomic executable tasks.

WORK ORDER:
- Intent: ${workOrder.intent}
- Summary: ${workOrder.summary}
- Affected Areas: ${workOrder.affectedAreas.join(', ')}
- Complexity: ${workOrder.complexity}
- Success Criteria:
${workOrder.successCriteria.map(c => `  - [${c.priority}] ${c.description}`).join('\n')}
- Constraints: ${workOrder.constraints.join(', ')}
- Risk Level: ${workOrder.riskLevel}

Create a task graph where each task is:
1. ATOMIC: Can be completed in one action
2. TESTABLE: Has a clear success/fail condition
3. ORDERED: Dependencies are explicit
4. SAFE: Risky operations require validation

Task types available:
- search_code: Find relevant code patterns
- read_file: Read a specific file
- write_file: Create a new file
- edit_file: Modify existing file
- run_test: Execute tests
- analyze: Think through a problem
- validate: Check work meets criteria
- commit: Save changes to git
- ask_user: Request clarification
- database_query: Query/modify data
- think: Reason about next steps
- summarize: Create summary

Return JSON array:
[
  {
    "id": "task-1",
    "title": "Short task title",
    "description": "What this task does",
    "actionType": "search_code|read_file|edit_file|...",
    "dependsOn": [],
    "estimatedMinutes": 2,
    "confidence": 0.9
  }
]

Order tasks logically: understand -> plan -> implement -> test -> commit`;

    try {
      const response = await geminiClient.generate({
        workspaceId: workOrder.workspaceId,
        userId: workOrder.userId,
        featureKey: 'task_decomposition',
        systemPrompt: 'You are an expert task planner for the CoAIleague platform.',
        userMessage: prompt,
      });

      const tasksData = this.extractJSONArray(response.text);
      
      const tasks: TaskNode[] = tasksData.map((t: any, i: number) => ({
        id: t.id || `task-${i + 1}`,
        workOrderId: workOrder.id,
        parentId: undefined,
        title: t.title,
        description: t.description,
        actionType: t.actionType || 'think',
        dependsOn: t.dependsOn || [],
        blocks: [],
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        estimatedMinutes: t.estimatedMinutes || 5,
        confidence: t.confidence || 0.8,
        createdAt: new Date(),
      }));

      // Build blocks relationships
      for (const task of tasks) {
        for (const depId of task.dependsOn) {
          const dep = tasks.find(t => t.id === depId);
          if (dep) {
            dep.blocks.push(task.id);
          }
        }
      }

      // Mark tasks with no dependencies as ready
      for (const task of tasks) {
        if (task.dependsOn.length === 0) {
          task.status = 'ready';
        }
      }

      this.taskGraphs.set(workOrder.id, tasks);
      
      log.info(`[TaskDecomposition] Created ${tasks.length} tasks in ${Date.now() - startTime}ms`);
      
      return tasks;
      
    } catch (error: any) {
      log.error('[TaskDecomposition] Decomposition failed:', (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  private extractJSONArray(text: string): any[] {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return [];
      }
    }
    return [];
  }

  getNextReadyTasks(workOrderId: string): TaskNode[] {
    const tasks = this.taskGraphs.get(workOrderId) || [];
    return tasks.filter(t => t.status === 'ready');
  }

  markTaskComplete(workOrderId: string, taskId: string, output: any): void {
    const tasks = this.taskGraphs.get(workOrderId) || [];
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'success';
      task.output = output;
      task.completedAt = new Date();
      
      // Unblock dependent tasks
      for (const blockedId of task.blocks) {
        const blocked = tasks.find(t => t.id === blockedId);
        if (blocked) {
          const allDepsComplete = blocked.dependsOn.every(
            depId => tasks.find(t => t.id === depId)?.status === 'success'
          );
          if (allDepsComplete) {
            blocked.status = 'ready';
          }
        }
      }
    }
  }

  markTaskFailed(workOrderId: string, taskId: string, error: string): void {
    const tasks = this.taskGraphs.get(workOrderId) || [];
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.attempts++;
      if (task.attempts >= task.maxAttempts) {
        task.status = 'failed';
        task.error = error;
        // Mark blocked tasks as blocked
        for (const blockedId of task.blocks) {
          const blocked = tasks.find(t => t.id === blockedId);
          if (blocked) blocked.status = 'blocked';
        }
      } else {
        task.status = 'ready'; // Will retry
      }
    }
  }

  getTaskGraph(workOrderId: string): TaskNode[] {
    return this.taskGraphs.get(workOrderId) || [];
  }
}

// ============================================================================
// SOLUTION DISCOVERY LOOP
// ============================================================================

class SolutionDiscoveryLoop {
  private static instance: SolutionDiscoveryLoop;
  private attempts: Map<string, SolutionAttempt[]> = new Map();
  private readonly MAX_ATTEMPTS = 3;
  
  static getInstance(): SolutionDiscoveryLoop {
    if (!this.instance) {
      this.instance = new SolutionDiscoveryLoop();
    }
    return this.instance;
  }

  async executeWithRetry(
    workOrder: WorkOrder,
    tasks: TaskNode[],
    onProgress?: (message: string) => void
  ): Promise<SolutionAttempt> {
    const workOrderAttempts = this.attempts.get(workOrder.id) || [];
    const attemptNumber = workOrderAttempts.length + 1;
    
    log.info(`[SolutionDiscovery] Starting attempt ${attemptNumber} for work order ${workOrder.id}`);
    onProgress?.(`Starting attempt ${attemptNumber}...`);
    
    const attempt: SolutionAttempt = {
      id: crypto.randomUUID(),
      workOrderId: workOrder.id,
      attemptNumber,
      approach: attemptNumber === 1 ? 'Initial approach based on work order analysis' : `Revised approach based on previous failure`,
      hypothesis: `This attempt will successfully complete all tasks`,
      tasksExecuted: [],
      changesApplied: [],
      testsRun: [],
      success: false,
      confidenceScore: 0,
      issues: [],
      shouldCommit: false,
      shouldRetry: false,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
    };

    const startTime = Date.now();
    const decomposer = TaskDecompositionEngine.getInstance();
    
    try {
      // Execute tasks in dependency order
      let iterations = 0;
      const maxIterations = tasks.length * 2;
      
      while (iterations < maxIterations) {
        iterations++;
        const readyTasks = decomposer.getNextReadyTasks(workOrder.id);
        
        if (readyTasks.length === 0) {
          // Check if all done or blocked
          const allTasks = decomposer.getTaskGraph(workOrder.id);
          const allComplete = allTasks.every(t => t.status === 'success' || t.status === 'skipped');
          const anyFailed = allTasks.some(t => t.status === 'failed');
          
          if (allComplete) {
            attempt.success = true;
            break;
          }
          if (anyFailed) {
            attempt.issues.push('One or more tasks failed');
            break;
          }
          break;
        }

        // Execute ready tasks (could parallelize in future)
        for (const task of readyTasks) {
          onProgress?.(`Executing: ${task.title}`);
          task.status = 'running';
          task.startedAt = new Date();
          
          try {
            const result = await this.executeTask(task, workOrder);
            attempt.tasksExecuted.push(task.id);
            
            if (result.success) {
              decomposer.markTaskComplete(workOrder.id, task.id, result.output);
              if (result.changes) {
                attempt.changesApplied.push(...result.changes);
              }
            } else {
              decomposer.markTaskFailed(workOrder.id, task.id, result.error || 'Unknown error');
              attempt.issues.push(`Task ${task.title} failed: ${result.error}`);
            }
          } catch (error: any) {
            decomposer.markTaskFailed(workOrder.id, task.id, (error instanceof Error ? error.message : String(error)));
            attempt.issues.push(`Task ${task.title} threw: ${(error instanceof Error ? error.message : String(error))}`);
          }
        }
      }

      // Determine success based on task completion
      const allTasks = decomposer.getTaskGraph(workOrder.id);
      const successfulTasks = allTasks.filter(t => t.status === 'success').length;
      const failedTasks = allTasks.filter(t => t.status === 'failed').length;
      const totalTasks = allTasks.length;
      
      attempt.success = failedTasks === 0 && successfulTasks === totalTasks;
      log.info(`[SolutionDiscovery] Task completion: ${successfulTasks}/${totalTasks} succeeded, ${failedTasks} failed`);

      // Run self-reflection on the attempt
      if (attempt.tasksExecuted.length > 0) {
        onProgress?.('Running self-reflection...');
        try {
          const reflectionResult = await selfReflectionEngine.reflect({
            executionId: attempt.id,
            workspaceId: workOrder.workspaceId,
            userId: workOrder.userId,
            originalIntent: workOrder.summary,
            executedSteps: attempt.tasksExecuted.map(id => {
              const task = allTasks.find(t => t.id === id);
              return {
                stepId: id,
                action: task?.actionType || 'unknown',
                input: { title: task?.title },
                output: task?.output,
                durationMs: task?.durationMs || 0,
                timestamp: task?.completedAt || new Date(),
              };
            }),
            currentOutput: attempt.changesApplied,
          });
          
          attempt.reflectionResult = reflectionResult;
          attempt.confidenceScore = reflectionResult.confidenceScore;
          
          // Only allow commit if reflection passes AND no failures
          attempt.shouldCommit = reflectionResult.passed && 
                                 reflectionResult.confidenceScore >= 0.8 && 
                                 failedTasks === 0;
          attempt.shouldRetry = (!reflectionResult.passed || failedTasks > 0) && 
                               attemptNumber < this.MAX_ATTEMPTS;
                               
          log.info(`[SolutionDiscovery] Reflection: ${reflectionResult.passed ? 'PASSED' : 'FAILED'}, confidence: ${(reflectionResult.confidenceScore * 100).toFixed(0)}%`);
        } catch (reflectionError: any) {
          log.error('[SolutionDiscovery] Reflection failed:', reflectionError.message);
          attempt.issues.push(`Self-reflection failed: ${reflectionError.message}`);
          attempt.confidenceScore = 0.5;
          attempt.shouldCommit = false;
          attempt.shouldRetry = attemptNumber < this.MAX_ATTEMPTS;
        }
      } else {
        // No tasks executed - mark as failed
        attempt.success = false;
        attempt.confidenceScore = 0;
        attempt.shouldCommit = false;
        attempt.shouldRetry = attemptNumber < this.MAX_ATTEMPTS;
        attempt.issues.push('No tasks were executed');
      }

    } catch (error: any) {
      log.error('[SolutionDiscovery] Attempt error:', (error instanceof Error ? error.message : String(error)));
      attempt.issues.push(`Attempt failed: ${(error instanceof Error ? error.message : String(error))}`);
      attempt.success = false;
      attempt.shouldCommit = false;
      attempt.shouldRetry = attemptNumber < this.MAX_ATTEMPTS;
    }

    attempt.completedAt = new Date();
    attempt.durationMs = Date.now() - startTime;
    
    workOrderAttempts.push(attempt);
    this.attempts.set(workOrder.id, workOrderAttempts);
    
    log.info(`[SolutionDiscovery] Attempt ${attemptNumber} completed:`, {
      success: attempt.success,
      confidence: attempt.confidenceScore,
      tasksExecuted: attempt.tasksExecuted.length,
      issues: attempt.issues.length,
      shouldCommit: attempt.shouldCommit,
      shouldRetry: attempt.shouldRetry,
    });
    
    return attempt;
  }

  private async executeTask(
    task: TaskNode,
    workOrder: WorkOrder
  ): Promise<{ success: boolean; output?: any; error?: string; changes?: ChangeRecord[] }> {
    const startTime = Date.now();
    log.info(`[SolutionDiscovery] Executing task: ${task.title} (${task.actionType})`);
    
    switch (task.actionType) {
      case 'search_code':
        try {
          const searchResult = await trinityCodeOps.searchCode({
            pattern: task.description,
            maxResults: 20,
          });
          task.durationMs = Date.now() - startTime;
          const hasResults = searchResult.results && searchResult.results.length > 0;
          return { 
            success: hasResults, 
            output: searchResult,
            error: hasResults ? undefined : 'No matching code found',
          };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      case 'read_file':
        try {
          const filePath = this.extractFilePath(task.description);
          const fs = await import('fs');
          if (!fs.default.existsSync(filePath)) {
            task.durationMs = Date.now() - startTime;
            return { success: false, error: `File not found: ${filePath}` };
          }
          const content = fs.default.readFileSync(filePath, 'utf-8');
          task.durationMs = Date.now() - startTime;
          return { success: true, output: { path: filePath, content: content.substring(0, 5000), lineCount: content.split('\n').length } };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      case 'write_file':
      case 'edit_file':
        try {
          // For write/edit, we need to use trinityCodeOps
          const filePath = this.extractFilePath(task.description);
          const fs = await import('fs');
          
          // Get the proposed content from AI analysis
          const editAnalysis = await geminiClient.generate({
            workspaceId: workOrder.workspaceId,
            userId: workOrder.userId,
            featureKey: 'code_generation',
            systemPrompt: 'You are an expert code generator. Generate clean, production-ready code.',
            userMessage: `Based on this task: "${task.description}"\n\nGenerate the code changes needed. Return only the code, no explanation.`,
          });
          
          // Track the change (preview only - actual commit requires approval)
          const changeRecord: ChangeRecord = {
            id: crypto.randomUUID(),
            file: filePath,
            changeType: task.actionType === 'write_file' ? 'created' : 'modified',
            diffPreview: editAnalysis.text.substring(0, 500),
            linesAdded: editAnalysis.text.split('\n').length,
            linesRemoved: 0,
            canRollback: true,
            rolledBack: false,
          };
          
          task.durationMs = Date.now() - startTime;
          return { 
            success: true, 
            output: { filePath, analysisComplete: true, pendingApproval: true },
            changes: [changeRecord],
          };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      case 'analyze':
      case 'think':
        try {
          const thinkResult = await geminiClient.generate({
            workspaceId: workOrder.workspaceId,
            userId: workOrder.userId,
            featureKey: 'analysis',
            systemPrompt: 'You are an expert analyst. Provide clear, actionable insights.',
            userMessage: `Analyze: ${task.description}\n\nContext: ${workOrder.summary}`,
          });
          task.durationMs = Date.now() - startTime;
          const hasOutput = thinkResult.text && thinkResult.text.length > 10;
          return { 
            success: hasOutput, 
            output: thinkResult.text,
            error: hasOutput ? undefined : 'Analysis produced no meaningful output',
          };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      case 'run_test':
        try {
          const testResult = await aiBrainTestRunner.runAllTests('Trinity Work Order');
          task.durationMs = Date.now() - startTime;
          const passed = testResult.summary.failed === 0;
          return { 
            success: passed, 
            output: testResult.summary,
            error: passed ? undefined : `${testResult.summary.failed}/${testResult.summary.total} tests failed`,
          };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: `Test execution failed: ${e.message}` };
        }

      case 'commit':
        // Commits require explicit approval through the commit protocol
        task.durationMs = Date.now() - startTime;
        return { 
          success: true, 
          output: { status: 'pending_approval', message: 'Commit requires human approval before execution' },
        };

      case 'validate':
        try {
          // Run actual validation checks
          const testResult = await aiBrainTestRunner.runTestsByCategory('api');
          task.durationMs = Date.now() - startTime;
          const passed = testResult.summary.failed === 0;
          return { 
            success: passed, 
            output: testResult.summary,
            error: passed ? undefined : `Validation failed: ${testResult.summary.failed} issues`,
          };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      case 'ask_user':
        // This should trigger clarification protocol
        task.durationMs = Date.now() - startTime;
        return { 
          success: false, 
          output: { requiresUserInput: true, question: task.description },
          error: 'Waiting for user input',
        };

      case 'database_query':
        try {
          // Use readonly database operations only
          const dbResult = await geminiClient.generate({
            workspaceId: workOrder.workspaceId,
            userId: workOrder.userId,
            featureKey: 'database_analysis',
            systemPrompt: 'You are a database analyst. Analyze query requirements and provide insights.',
            userMessage: `Analyze database query requirements: ${task.description}`,
          });
          task.durationMs = Date.now() - startTime;
          return { success: true, output: dbResult.text };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      case 'summarize':
        try {
          const summaryResult = await geminiClient.generate({
            workspaceId: workOrder.workspaceId,
            userId: workOrder.userId,
            featureKey: 'summarization',
            systemPrompt: 'You are an expert summarizer. Create clear, concise summaries.',
            userMessage: `Summarize: ${task.description}`,
          });
          task.durationMs = Date.now() - startTime;
          return { success: true, output: summaryResult.text };
        } catch (e: any) {
          task.durationMs = Date.now() - startTime;
          return { success: false, error: e.message };
        }

      default:
        task.durationMs = Date.now() - startTime;
        log.warn(`[SolutionDiscovery] Unknown action type: ${task.actionType}`);
        return { success: false, error: `Unknown action type: ${task.actionType}` };
    }
  }

  private extractFilePath(description: string): string {
    const pathMatch = description.match(/['"]([^'"]+\.[a-z]+)['"]/i) ||
                      description.match(/(\S+\.[a-z]+)/i);
    return pathMatch ? pathMatch[1] : 'unknown.txt';
  }

  getAttempts(workOrderId: string): SolutionAttempt[] {
    return this.attempts.get(workOrderId) || [];
  }
}

// ============================================================================
// CONFIDENT COMMIT PROTOCOL
// ============================================================================

class ConfidentCommitProtocol {
  private static instance: ConfidentCommitProtocol;
  
  static getInstance(): ConfidentCommitProtocol {
    if (!this.instance) {
      this.instance = new ConfidentCommitProtocol();
    }
    return this.instance;
  }

  async evaluateCommitReadiness(
    workOrder: WorkOrder,
    attempt: SolutionAttempt
  ): Promise<CommitDecision> {
    log.info(`[CommitProtocol] Evaluating commit readiness for attempt ${attempt.attemptNumber}...`);
    
    const decision: CommitDecision = {
      shouldCommit: false,
      confidenceScore: attempt.confidenceScore,
      testsPass: false,
      reflectionPass: false, // Must be earned through validation
      noRegressions: false, // Must be earned through validation
      meetsCriteria: [],
      unmetCriteria: [],
      riskAcceptable: workOrder.riskLevel !== 'critical',
      riskMitigations: [],
      requiresHumanReview: false,
    };

    // Run actual tests using AI Brain Test Runner
    try {
      log.info('[CommitProtocol] Running test suite...');
      const testResults = await aiBrainTestRunner.runAll('Commit Validation');
      decision.testsPass = testResults.summary.failed === 0;
      
      if (!decision.testsPass) {
        decision.riskMitigations.push(`${testResults.summary.failed} tests failed - needs investigation`);
        log.info(`[CommitProtocol] Tests FAILED: ${testResults.summary.failed}/${testResults.summary.total}`);
      } else {
        log.info(`[CommitProtocol] Tests PASSED: ${testResults.summary.passed}/${testResults.summary.total}`);
      }
    } catch (error: any) {
      log.error('[CommitProtocol] Test execution error:', (error instanceof Error ? error.message : String(error)));
      decision.testsPass = false;
      decision.riskMitigations.push(`Test execution failed: ${(error instanceof Error ? error.message : String(error))}`);
    }

    // Run self-reflection if not already done in attempt
    if (!attempt.reflectionResult) {
      try {
        log.info('[CommitProtocol] Running self-reflection...');
        const reflectionResult = await selfReflectionEngine.reflect({
          executionId: attempt.id,
          workspaceId: workOrder.workspaceId,
          userId: workOrder.userId,
          originalIntent: workOrder.summary,
          executedSteps: attempt.tasksExecuted.map(id => ({
            stepId: id,
            action: 'executed',
            input: {},
            output: 'completed',
            durationMs: 0,
            timestamp: new Date(),
          })),
          currentOutput: { changesApplied: attempt.changesApplied.length },
        });
        decision.reflectionPass = reflectionResult.passed;
        decision.confidenceScore = reflectionResult.confidenceScore;
        log.info(`[CommitProtocol] Reflection ${reflectionResult.passed ? 'PASSED' : 'FAILED'}: ${(reflectionResult.confidenceScore * 100).toFixed(0)}% confidence`);
      } catch (error: any) {
        log.error('[CommitProtocol] Reflection error:', (error instanceof Error ? error.message : String(error)));
        decision.reflectionPass = false;
        decision.riskMitigations.push(`Self-reflection failed: ${(error instanceof Error ? error.message : String(error))}`);
      }
    } else {
      decision.reflectionPass = attempt.reflectionResult.passed;
    }

    // Check for regressions based on test results
    decision.noRegressions = decision.testsPass;

    // Evaluate each success criterion
    for (const criterion of workOrder.successCriteria) {
      const met = await this.evaluateCriterion(criterion, attempt);
      const result: CriterionResult = {
        criterionId: criterion.id,
        description: criterion.description,
        met: met.success,
        evidence: met.evidence,
      };
      
      if (met.success) {
        decision.meetsCriteria.push(result);
      } else {
        decision.unmetCriteria.push(result);
      }
    }

    // Determine if human review is needed
    decision.requiresHumanReview = 
      workOrder.requiresApproval ||
      decision.confidenceScore < 0.7 ||
      decision.unmetCriteria.some(c => workOrder.successCriteria.find(sc => sc.id === c.criterionId)?.priority === 'must') ||
      workOrder.riskLevel === 'high' ||
      workOrder.riskLevel === 'critical';

    if (decision.requiresHumanReview) {
      decision.reviewReason = this.determineReviewReason(decision, workOrder);
    }

    // Final decision
    const mustCriteriaMet = decision.unmetCriteria.every(
      c => workOrder.successCriteria.find(sc => sc.id === c.criterionId)?.priority !== 'must'
    );
    
    decision.shouldCommit = 
      decision.testsPass &&
      decision.reflectionPass &&
      decision.noRegressions &&
      decision.riskAcceptable &&
      mustCriteriaMet &&
      decision.confidenceScore >= 0.75 &&
      !decision.requiresHumanReview;

    log.info(`[CommitProtocol] Decision:`, {
      shouldCommit: decision.shouldCommit,
      confidence: decision.confidenceScore,
      testsPass: decision.testsPass,
      criteriaMetRatio: `${decision.meetsCriteria.length}/${decision.meetsCriteria.length + decision.unmetCriteria.length}`,
      requiresReview: decision.requiresHumanReview,
    });

    return decision;
  }

  private async evaluateCriterion(
    criterion: SuccessCriterion,
    attempt: SolutionAttempt
  ): Promise<{ success: boolean; evidence: string }> {
    // Simple heuristic evaluation - in production this would be more sophisticated
    if (attempt.success && attempt.confidenceScore >= 0.7) {
      return { success: true, evidence: `Attempt succeeded with ${(attempt.confidenceScore * 100).toFixed(0)}% confidence` };
    }
    return { success: false, evidence: `Attempt had issues: ${attempt.issues.join(', ')}` };
  }

  private determineReviewReason(decision: CommitDecision, workOrder: WorkOrder): string {
    if (workOrder.riskLevel === 'critical') return 'Critical risk level requires human approval';
    if (workOrder.requiresApproval) return 'Work order flagged for approval';
    if (decision.confidenceScore < 0.7) return `Low confidence score (${(decision.confidenceScore * 100).toFixed(0)}%)`;
    if (!decision.testsPass) return 'Some tests failed';
    return 'Review recommended for safety';
  }
}

// ============================================================================
// CLARIFICATION PROTOCOL
// ============================================================================

class ClarificationProtocol {
  private static instance: ClarificationProtocol;
  
  static getInstance(): ClarificationProtocol {
    if (!this.instance) {
      this.instance = new ClarificationProtocol();
    }
    return this.instance;
  }

  shouldAskForClarification(workOrder: WorkOrder): { shouldAsk: boolean; questions: Ambiguity[] } {
    const blockingAmbiguities = workOrder.ambiguities.filter(
      a => a.impact === 'blocking' && !a.resolved
    );
    
    const highRiskAssumptions = workOrder.assumptions.length > 3 && workOrder.riskLevel !== 'low';
    
    if (blockingAmbiguities.length > 0) {
      return { shouldAsk: true, questions: blockingAmbiguities };
    }
    
    if (highRiskAssumptions && workOrder.complexity === 'complex') {
      const assumptionQuestions: Ambiguity[] = workOrder.assumptions.slice(0, 2).map((a, i) => ({
        id: `assumption-${i}`,
        question: `Should I proceed with this assumption: "${a}"?`,
        context: 'High-risk work order has multiple assumptions',
        impact: 'clarifying' as const,
        resolved: false,
      }));
      return { shouldAsk: true, questions: assumptionQuestions };
    }
    
    return { shouldAsk: false, questions: [] };
  }

  resolveAmbiguity(workOrder: WorkOrder, ambiguityId: string, resolution: string): void {
    const ambiguity = workOrder.ambiguities.find(a => a.id === ambiguityId);
    if (ambiguity) {
      ambiguity.resolved = true;
      ambiguity.resolution = resolution;
      
      // Re-check if clarification is still required
      workOrder.clarificationRequired = workOrder.ambiguities.some(
        a => a.impact === 'blocking' && !a.resolved
      );
    }
  }

  generateClarificationMessage(ambiguities: Ambiguity[]): string {
    if (ambiguities.length === 0) return '';
    
    if (ambiguities.length === 1) {
      const a = ambiguities[0];
      return `Before I proceed, I need to clarify: ${a.question}${a.options ? `\n\nOptions: ${a.options.join(', ')}` : ''}`;
    }
    
    return `I have ${ambiguities.length} questions before proceeding:\n\n` +
      ambiguities.map((a, i) => `${i + 1}. ${a.question}`).join('\n');
  }
}

// ============================================================================
// WORK SUMMARY ENGINE
// ============================================================================

class WorkSummaryEngine {
  private static instance: WorkSummaryEngine;
  
  static getInstance(): WorkSummaryEngine {
    if (!this.instance) {
      this.instance = new WorkSummaryEngine();
    }
    return this.instance;
  }

  async generateSummary(
    workOrder: WorkOrder,
    attempts: SolutionAttempt[]
  ): Promise<WorkSummary> {
    const lastAttempt = attempts[attempts.length - 1];
    const allTasks = TaskDecompositionEngine.getInstance().getTaskGraph(workOrder.id);
    
    const completedTasks = allTasks.filter(t => t.status === 'success').length;
    const failedTasks = allTasks.filter(t => t.status === 'failed').length;
    
    const allChanges = attempts.flatMap(a => a.changesApplied);
    const linesAdded = allChanges.reduce((sum, c) => sum + c.linesAdded, 0);
    const linesRemoved = allChanges.reduce((sum, c) => sum + c.linesRemoved, 0);
    
    const totalDuration = attempts.reduce((sum, a) => sum + a.durationMs, 0);
    
    const summary: WorkSummary = {
      workOrderId: workOrder.id,
      title: workOrder.summary,
      intent: workOrder.intent,
      outcome: lastAttempt?.success ? 'success' : failedTasks > 0 ? 'failed' : 'partial',
      tasksCompleted: completedTasks,
      tasksFailed: failedTasks,
      attemptsNeeded: attempts.length,
      filesModified: new Set(allChanges.map(c => c.file)).size,
      linesAdded,
      linesRemoved,
      testsPassed: 0,
      testsFailed: 0,
      majorChanges: allChanges.slice(0, 5).map(c => `${c.changeType} ${c.file}`),
      risksAddressed: workOrder.riskFactors.filter((_, i) => i < 3),
      knownLimitations: lastAttempt?.issues || [],
      recommendations: this.generateRecommendations(workOrder, lastAttempt),
      remainingWork: failedTasks > 0 ? ['Investigate and retry failed tasks'] : [],
      totalDurationMs: totalDuration,
      humanReadableDuration: this.formatDuration(totalDuration),
    };

    return summary;
  }

  private generateRecommendations(workOrder: WorkOrder, lastAttempt?: SolutionAttempt): string[] {
    const recommendations: string[] = [];
    
    if (lastAttempt?.confidenceScore && lastAttempt.confidenceScore < 0.8) {
      recommendations.push('Consider adding more test coverage');
    }
    
    if (workOrder.riskLevel === 'high') {
      recommendations.push('Monitor closely after deployment');
    }
    
    if (workOrder.assumptions.length > 2) {
      recommendations.push('Validate assumptions with stakeholders');
    }
    
    return recommendations;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  formatForDisplay(summary: WorkSummary): string {
    return `
## Work Order Summary: ${summary.title}

**Outcome:** ${summary.outcome.toUpperCase()}
**Duration:** ${summary.humanReadableDuration}
**Attempts:** ${summary.attemptsNeeded}

### Progress
- Tasks completed: ${summary.tasksCompleted}
- Tasks failed: ${summary.tasksFailed}

### Changes
- Files modified: ${summary.filesModified}
- Lines added: ${summary.linesAdded}
- Lines removed: ${summary.linesRemoved}

### Major Changes
${summary.majorChanges.map(c => `- ${c}`).join('\n')}

${summary.knownLimitations.length > 0 ? `### Known Limitations\n${summary.knownLimitations.map(l => `- ${l}`).join('\n')}` : ''}

${summary.recommendations.length > 0 ? `### Recommendations\n${summary.recommendations.map(r => `- ${r}`).join('\n')}` : ''}

${summary.remainingWork.length > 0 ? `### Remaining Work\n${summary.remainingWork.map(w => `- ${w}`).join('\n')}` : ''}
`.trim();
  }
}

// ============================================================================
// ORCHESTRATION ENTRY POINT
// ============================================================================

export class TrinityWorkOrderOrchestrator {
  private static instance: TrinityWorkOrderOrchestrator;
  
  private intake = TrinityWorkOrderIntake.getInstance();
  private decomposer = TaskDecompositionEngine.getInstance();
  private solutionLoop = SolutionDiscoveryLoop.getInstance();
  private commitProtocol = ConfidentCommitProtocol.getInstance();
  private clarification = ClarificationProtocol.getInstance();
  private summaryEngine = WorkSummaryEngine.getInstance();
  
  static getInstance(): TrinityWorkOrderOrchestrator {
    if (!this.instance) {
      this.instance = new TrinityWorkOrderOrchestrator();
    }
    return this.instance;
  }

  async processWorkOrder(
    request: string,
    workspaceId: string,
    userId: string,
    onProgress?: (message: string) => void
  ): Promise<{
    workOrder: WorkOrder;
    summary: WorkSummary;
    needsClarification: boolean;
    clarificationQuestions?: Ambiguity[];
    commitDecision?: CommitDecision;
  }> {
    onProgress?.('Parsing work order...');
    
    // Step 1: Intake
    const workOrder = await this.intake.parseWorkOrder(request, workspaceId, userId);
    this.intake.updateStatus(workOrder.id, 'intake');
    
    // Step 2: Check for clarification
    const clarificationCheck = this.clarification.shouldAskForClarification(workOrder);
    if (clarificationCheck.shouldAsk) {
      this.intake.updateStatus(workOrder.id, 'clarifying');
      return {
        workOrder,
        summary: await this.summaryEngine.generateSummary(workOrder, []),
        needsClarification: true,
        clarificationQuestions: clarificationCheck.questions,
      };
    }
    
    // Step 3: Decompose
    onProgress?.('Breaking down into tasks...');
    this.intake.updateStatus(workOrder.id, 'decomposing');
    const tasks = await this.decomposer.decompose(workOrder);
    
    // Step 4: Execute with retry loop
    this.intake.updateStatus(workOrder.id, 'executing');
    let lastAttempt: SolutionAttempt | undefined;
    
    for (let i = 0; i < 3; i++) {
      lastAttempt = await this.solutionLoop.executeWithRetry(workOrder, tasks, onProgress);
      
      if (lastAttempt.success || !lastAttempt.shouldRetry) {
        break;
      }
      
      onProgress?.(`Attempt ${i + 1} failed, retrying...`);
    }
    
    // Step 5: Evaluate commit readiness
    let commitDecision: CommitDecision | undefined;
    if (lastAttempt && lastAttempt.success) {
      onProgress?.('Evaluating commit readiness...');
      this.intake.updateStatus(workOrder.id, 'testing');
      commitDecision = await this.commitProtocol.evaluateCommitReadiness(workOrder, lastAttempt);
      
      if (commitDecision.shouldCommit) {
        this.intake.updateStatus(workOrder.id, 'committing');
        // In production, would actually commit here
        this.intake.updateStatus(workOrder.id, 'completed');
      } else if (commitDecision.requiresHumanReview) {
        this.intake.updateStatus(workOrder.id, 'awaiting_approval');
      }
    } else {
      this.intake.updateStatus(workOrder.id, 'failed');
    }
    
    // Step 6: Generate summary
    onProgress?.('Generating summary...');
    const attempts = this.solutionLoop.getAttempts(workOrder.id);
    const summary = await this.summaryEngine.generateSummary(workOrder, attempts);
    
    platformEventBus.publish({
      type: 'work_order_completed',
      category: 'feature',
      title: 'Work Order Completed',
      description: `Work order ${workOrder.id} completed`,
      workspaceId: workOrder.workspaceId,
      metadata: {
        workOrderId: workOrder.id,
        success: workOrder.status === 'completed',
        summary: summary.title,
      },
    }).catch((err) => log.warn('[trinityWorkOrderSystem] Fire-and-forget failed:', err));
    
    return {
      workOrder,
      summary,
      needsClarification: false,
      commitDecision,
    };
  }

  provideClarification(workOrderId: string, ambiguityId: string, resolution: string): void {
    const workOrder = this.intake.getWorkOrder(workOrderId);
    if (workOrder) {
      this.clarification.resolveAmbiguity(workOrder, ambiguityId, resolution);
    }
  }

  formatSummary(summary: WorkSummary): string {
    return this.summaryEngine.formatForDisplay(summary);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trinityWorkOrderOrchestrator = TrinityWorkOrderOrchestrator.getInstance();
export const trinityWorkOrderIntake = TrinityWorkOrderIntake.getInstance();
export const taskDecompositionEngine = TaskDecompositionEngine.getInstance();
export const solutionDiscoveryLoop = SolutionDiscoveryLoop.getInstance();
export const confidentCommitProtocol = ConfidentCommitProtocol.getInstance();
export const clarificationProtocol = ClarificationProtocol.getInstance();
export const workSummaryEngine = WorkSummaryEngine.getInstance();

log.info('[TrinityWorkOrderSystem] Work order orchestration system initialized');
