/**
 * AI Brain Workflow Step Executor
 * 
 * Enables AI Brain to define and execute step-based workflows:
 * - Create workflow definitions with multiple steps
 * - Execute workflows with progress tracking
 * - Handle step dependencies and conditions
 * - Rollback on failure
 * - Real-time progress notifications
 * 
 * Perfect for complex multi-step operations like deployments,
 * migrations, and comprehensive platform updates.
 */

import crypto from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { broadcastToAllClients } from '../../websocket';
import { aiBrainFileSystemTools } from './aiBrainFileSystemTools';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('aiBrainWorkflowExecutor');

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'rolled_back';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  action: StepAction;
  dependsOn?: string[];
  condition?: StepCondition;
  onFailure?: 'stop' | 'continue' | 'rollback';
  timeout?: number;
  retries?: number;
}

export type StepAction = 
  | { type: 'file_read'; path: string; startLine?: number; endLine?: number }
  | { type: 'file_write'; path: string; content: string; createDirs?: boolean }
  | { type: 'file_edit'; path: string; search: string; replace: string; all?: boolean }
  | { type: 'file_delete'; path: string }
  | { type: 'file_copy'; source: string; dest: string }
  | { type: 'file_move'; source: string; dest: string }
  | { type: 'search'; path: string; pattern: string; filePattern?: string }
  | { type: 'shell'; command: string; cwd?: string }
  | { type: 'http_request'; url: string; method: string; body?: any; headers?: Record<string, string> }
  | { type: 'db_query'; query: string; params?: any[] }
  | { type: 'notify'; title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }
  | { type: 'wait'; duration: number }
  | { type: 'custom'; handler: string; params?: Record<string, any> };

export interface StepCondition {
  type: 'file_exists' | 'file_not_exists' | 'env_set' | 'previous_result' | 'custom';
  path?: string;
  envVar?: string;
  stepId?: string;
  expectedValue?: any;
  handler?: string;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  output?: any;
  error?: string;
  rollbackData?: any;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  onComplete?: { type: 'notify'; title: string; message: string };
  onFailure?: { type: 'notify'; title: string; message: string };
  metadata?: Record<string, unknown>;
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  stepResults: StepResult[];
  currentStep?: string;
  context: Record<string, unknown>;
  requestedBy: string;
}

class AIBrainWorkflowExecutor {
  private static instance: AIBrainWorkflowExecutor;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private customHandlers: Map<string, (params: any, context: any) => Promise<any>> = new Map();

  static getInstance(): AIBrainWorkflowExecutor {
    if (!this.instance) {
      this.instance = new AIBrainWorkflowExecutor();
    }
    return this.instance;
  }

  constructor() {
    this.registerBuiltInHandlers();
  }

  private registerBuiltInHandlers(): void {
    this.registerCustomHandler('log_message', async (params) => {
      log.info(`[Workflow] ${params.message}`);
      return { logged: true, message: params.message };
    });

    this.registerCustomHandler('validate_json', async (params) => {
      try {
        JSON.parse(params.content);
        return { valid: true };
      } catch (e: unknown) {
        return { valid: false, error: e.message };
      }
    });

    this.registerCustomHandler('aggregate_results', async (params, context) => {
      const results = params.stepIds.map((id: string) => {
        const result = context.stepResults?.[id];
        return { stepId: id, output: result?.output };
      });
      return { aggregated: results };
    });
  }

  registerCustomHandler(
    name: string, 
    handler: (params: any, context: any) => Promise<any>
  ): void {
    this.customHandlers.set(name, handler);
    log.info(`[WorkflowExecutor] Registered custom handler: ${name}`);
  }

  registerWorkflow(definition: WorkflowDefinition): void {
    this.workflows.set(definition.id, definition);
    log.info(`[WorkflowExecutor] Registered workflow: ${definition.id} (${definition.steps.length} steps)`);
  }

  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  listExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  private generateExecutionId(): string {
    return `exec-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  private async broadcastProgress(execution: WorkflowExecution, step?: WorkflowStep): void {
    broadcastToAllClients({
      type: 'workflow:progress',
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      status: execution.status,
      currentStep: step?.name,
      completedSteps: execution.stepResults.filter(r => r.status === 'completed').length,
      totalSteps: this.workflows.get(execution.workflowId)?.steps.length || 0,
      timestamp: new Date().toISOString(),
    });
  }

  private async checkCondition(condition: StepCondition, context: Record<string, unknown>): Promise<boolean> {
    switch (condition.type) {
      case 'file_exists':
        return await aiBrainFileSystemTools.exists(condition.path!);
      
      case 'file_not_exists':
        return !(await aiBrainFileSystemTools.exists(condition.path!));
      
      case 'env_set':
        return !!process.env[condition.envVar!];
      
      case 'previous_result':
        const prevResult = context.stepResults?.[condition.stepId!];
        if (!prevResult) return false;
        if (condition.expectedValue !== undefined) {
          return prevResult.output === condition.expectedValue;
        }
        return prevResult.status === 'completed';
      
      case 'custom':
        const handler = this.customHandlers.get(condition.handler!);
        if (!handler) return false;
        const result = await handler({}, context);
        return !!result;
      
      default:
        return true;
    }
  }

  private async executeStepAction(action: StepAction, context: Record<string, unknown>): Promise<unknown> {
    switch (action.type) {
      case 'file_read':
        const readResult = await aiBrainFileSystemTools.readFile(
          action.path, 
          { startLine: action.startLine, endLine: action.endLine }
        );
        if (!readResult.success) throw new Error(readResult.error);
        return readResult.data;

      case 'file_write':
        const writeResult = await aiBrainFileSystemTools.writeFile(
          action.path,
          action.content,
          { createDirectories: action.createDirs }
        );
        if (!writeResult.success) throw new Error(writeResult.error);
        return { written: true, path: action.path };

      case 'file_edit':
        const editResult = await aiBrainFileSystemTools.editFile(
          action.path,
          action.search,
          action.replace,
          { all: action.all }
        );
        if (!editResult.success) throw new Error(editResult.error);
        return editResult.data;

      case 'file_delete':
        const deleteResult = await aiBrainFileSystemTools.deleteFile(action.path);
        if (!deleteResult.success) throw new Error(deleteResult.error);
        return { deleted: true, path: action.path };

      case 'file_copy':
        const copyResult = await aiBrainFileSystemTools.copyFile(action.source, action.dest);
        if (!copyResult.success) throw new Error(copyResult.error);
        return { copied: true, source: action.source, dest: action.dest };

      case 'file_move':
        const moveResult = await aiBrainFileSystemTools.moveFile(action.source, action.dest);
        if (!moveResult.success) throw new Error(moveResult.error);
        return { moved: true, source: action.source, dest: action.dest };

      case 'search':
        const searchResult = await aiBrainFileSystemTools.searchFiles(action.path, {
          pattern: action.pattern,
          filePattern: action.filePattern,
        });
        if (!searchResult.success) throw new Error(searchResult.error);
        return searchResult.data;

      case 'shell':
        const { exec } = await import('child_process');
        return new Promise((resolve, reject) => {
          exec(action.command, { cwd: action.cwd || process.cwd() }, (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Shell command failed: ${stderr || error.message}`));
            } else {
              resolve({ stdout, stderr });
            }
          });
        });

      case 'http_request': {
        // SSRF guard: validate URL before making outbound HTTP request from AI workflow step
        if (!action.url || typeof action.url !== 'string') {
          throw new Error('http_request step requires a valid URL');
        }
        try {
          const { validateWebhookUrl } = await import('../webhookDeliveryService');
          await validateWebhookUrl(action.url);
        } catch {
          throw new Error(`http_request step URL is not allowed (internal/private addresses are blocked): ${action.url}`);
        }
        const response = await fetch(action.url, {
          method: action.method,
          signal: AbortSignal.timeout(30000),
          headers: action.headers,
          body: action.body ? JSON.stringify(action.body) : undefined,
        });
        const data = await response.json().catch(() => response.text());
        return { status: response.status, data };
      }

      case 'notify':
        broadcastToAllClients({
          type: 'workflow:notification',
          notificationType: action.type,
          title: action.title,
          message: action.message,
          timestamp: new Date().toISOString(),
        });
        return { notified: true };

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, action.duration));
        return { waited: action.duration };

      case 'custom':
        const customHandler = this.customHandlers.get(action.handler);
        if (!customHandler) {
          throw new Error(`Custom handler not found: ${action.handler}`);
        }
        return await customHandler(action.params || {}, context);

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  async executeWorkflow(
    workflowId: string,
    requestedBy: string,
    initialContext: Record<string, unknown> = {}
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = this.generateExecutionId();
    const execution: WorkflowExecution = {
      executionId,
      workflowId,
      status: 'running',
      startedAt: new Date(),
      stepResults: [],
      context: { ...initialContext, stepResults: {} },
      requestedBy,
    };

    this.executions.set(executionId, execution);

    log.info(`[WorkflowExecutor] Starting workflow: ${workflowId} (execution: ${executionId})`);

    await this.logExecution(execution, 'started', { stepCount: workflow.steps.length });
    await this.broadcastProgress(execution);

    const completedSteps = new Set<string>();

    for (const step of workflow.steps) {
      execution.currentStep = step.id;

      if (step.dependsOn?.some(depId => !completedSteps.has(depId))) {
        const result: StepResult = {
          stepId: step.id,
          status: 'skipped',
          startedAt: new Date(),
          completedAt: new Date(),
          error: 'Dependencies not met',
        };
        execution.stepResults.push(result);
        execution.context.stepResults[step.id] = result;
        continue;
      }

      if (step.condition) {
        const conditionMet = await this.checkCondition(step.condition, execution.context);
        if (!conditionMet) {
          const result: StepResult = {
            stepId: step.id,
            status: 'skipped',
            startedAt: new Date(),
            completedAt: new Date(),
            error: 'Condition not met',
          };
          execution.stepResults.push(result);
          execution.context.stepResults[step.id] = result;
          continue;
        }
      }

      const stepResult: StepResult = {
        stepId: step.id,
        status: 'running',
        startedAt: new Date(),
      };

      await this.broadcastProgress(execution, step);

      let retryCount = 0;
      const maxRetries = step.retries || 0;

      while (retryCount <= maxRetries) {
        try {
          const output = await Promise.race([
            this.executeStepAction(step.action, execution.context),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Step timeout')), step.timeout || 60000)
            ),
          ]);

          stepResult.status = 'completed';
          stepResult.output = output;
          stepResult.completedAt = new Date();
          stepResult.duration = stepResult.completedAt.getTime() - stepResult.startedAt.getTime();

          completedSteps.add(step.id);
          break;
        } catch (error: unknown) {
          retryCount++;
          if (retryCount > maxRetries) {
            stepResult.status = 'failed';
            stepResult.error = (error instanceof Error ? error.message : String(error));
            stepResult.completedAt = new Date();
            stepResult.duration = stepResult.completedAt.getTime() - stepResult.startedAt.getTime();

            if (step.onFailure === 'stop') {
              execution.status = 'failed';
              execution.completedAt = new Date();
              execution.stepResults.push(stepResult);
              execution.context.stepResults[step.id] = stepResult;

              if (workflow.onFailure) {
                broadcastToAllClients({
                  type: 'workflow:notification',
                  notificationType: 'error',
                  title: workflow.onFailure.title,
                  message: workflow.onFailure.message,
                });
              }

              await this.logExecution(execution, 'failed', { 
                failedStep: step.id, 
                error: error.message 
              });
              await this.broadcastProgress(execution);

              return execution;
            } else if (step.onFailure === 'rollback') {
              log.info(`[WorkflowExecutor] Rolling back workflow due to step failure: ${step.id}`);
            }
          } else {
            log.info(`[WorkflowExecutor] Retrying step ${step.id} (attempt ${retryCount + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }

      execution.stepResults.push(stepResult);
      execution.context.stepResults[step.id] = stepResult;
    }

    execution.status = 'completed';
    execution.completedAt = new Date();

    if (workflow.onComplete) {
      broadcastToAllClients({
        type: 'workflow:notification',
        notificationType: 'success',
        title: workflow.onComplete.title,
        message: workflow.onComplete.message,
      });
    }

    await this.logExecution(execution, 'completed', {
      duration: execution.completedAt.getTime() - execution.startedAt.getTime(),
      completedSteps: completedSteps.size,
      totalSteps: workflow.steps.length,
    });
    await this.broadcastProgress(execution);

    log.info(`[WorkflowExecutor] Workflow completed: ${workflowId} (${completedSteps.size}/${workflow.steps.length} steps)`);

    return execution;
  }

  async cancelExecution(executionId: string, userId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();

    await this.logExecution(execution, 'cancelled', { cancelledBy: userId });
    await this.broadcastProgress(execution);

    return true;
  }

  private async logExecution(
    execution: WorkflowExecution,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId: execution.requestedBy,
        action: `ai_brain_workflow:${action}`,
        ipAddress: 'ai-brain-internal',
        metadata: { targetType: 'workflow', targetId: execution.executionId,
        details: {
          workflowId: execution.workflowId,
          ...details,
          timestamp: new Date().toISOString(),
        } },
      });
    } catch (error) {
      log.error('[WorkflowExecutor] Failed to log execution:', error);
    }
  }

  createQuickWorkflow(
    name: string,
    steps: Array<{
      name: string;
      action: StepAction;
      onFailure?: 'stop' | 'continue';
    }>
  ): WorkflowDefinition {
    const workflow: WorkflowDefinition = {
      id: `quick-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      name,
      description: `Quick workflow: ${name}`,
      version: '1.0.0',
      steps: steps.map((s, i) => ({
        id: `step-${i + 1}`,
        name: s.name,
        description: s.name,
        action: s.action,
        onFailure: s.onFailure || 'stop',
      })),
      onComplete: {
        type: 'notify',
        title: 'Workflow Complete',
        message: `${name} has completed successfully`,
      },
      onFailure: {
        type: 'notify',
        title: 'Workflow Failed',
        message: `${name} encountered an error`,
      },
    };

    this.registerWorkflow(workflow);
    return workflow;
  }
}

export const aiBrainWorkflowExecutor = AIBrainWorkflowExecutor.getInstance();
export { AIBrainWorkflowExecutor };
