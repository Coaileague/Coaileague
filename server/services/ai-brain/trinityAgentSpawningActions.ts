/**
 * Trinity Agent Spawning Actions
 * ==============================
 * Phase 4: Registers 5 new Trinity actions for the Agent Spawning System.
 * Follows exact registration pattern from platformActionHub.ts.
 *
 * Actions:
 *   agent.spawn                — Spawn a single domain agent
 *   agent.spawn_parallel       — Spawn multiple agents simultaneously
 *   agent.evaluate_payload     — Evaluate agent returned payload
 *   agent.escalate_helpai      — Escalate borderline payload to HelpAI
 *   agent.retask               — Re-spawn a below-threshold agent
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionRequest, ActionResult, ActionHandler } from '../helpai/platformActionHub';
import { spawnAgent, spawnParallelAgents, evaluateAgentPayload } from './agentSpawner';
import type { AgentTask } from './agentSpawner';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityAgentSpawningActions');

export function registerAgentSpawningActions(): void {
  // ── 1. SPAWN_AGENT ─────────────────────────────────────────────────────────
  const spawnAction: ActionHandler = {
    actionId: 'agent.spawn',
    name: 'Spawn Agent',
    category: 'automation',
    description: 'Spawns a single domain-specialized agent for a task. Inputs: workspaceId, agentKey, taskType, inputPayload, relatedEntityType?, relatedEntityId?',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const { payload, workspaceId } = request;
      const start = Date.now();
      try {
        if (!payload?.agentKey || !payload?.taskType) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'agent.spawn requires agentKey and taskType in payload',
            executionTimeMs: Date.now() - start,
          };
        }
        const task = await spawnAgent({
          workspaceId: (payload.workspaceId as string) || workspaceId || '',
          agentKey: payload.agentKey as string,
          taskType: payload.taskType as string,
          inputPayload: (payload.inputPayload as Record<string, unknown>) || {},
          relatedEntityType: payload.relatedEntityType as string | undefined,
          relatedEntityId: payload.relatedEntityId as string | undefined,
          spawnedBy: 'trinity',
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Agent ${task.agentKey} task ${task.id} — status: ${task.status}, score: ${task.completionScore ?? 'N/A'}`,
          data: task,
          executionTimeMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          actionId: request.actionId,
          message: `agent.spawn error: ${err instanceof Error ? err.message : String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(spawnAction);

  // ── 2. SPAWN_PARALLEL_AGENTS ───────────────────────────────────────────────
  const spawnParallelAction: ActionHandler = {
    actionId: 'agent.spawn_parallel',
    name: 'Spawn Parallel Agents',
    category: 'automation',
    description: 'Spawns multiple agents simultaneously for complex multi-domain tasks. Inputs: workspaceId, tasks (array of {agentKey, taskType, inputPayload})',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const { payload, workspaceId } = request;
      const start = Date.now();
      try {
        if (!Array.isArray(payload?.tasks) || (payload.tasks as unknown[]).length === 0) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'agent.spawn_parallel requires tasks array in payload',
            executionTimeMs: Date.now() - start,
          };
        }
        const tasks = await spawnParallelAgents({
          workspaceId: (payload.workspaceId as string) || workspaceId || '',
          tasks: payload.tasks as Array<{
            agentKey: string;
            taskType: string;
            inputPayload: Record<string, unknown>;
            relatedEntityType?: string;
            relatedEntityId?: string;
          }>,
          spawnedBy: 'trinity',
        });
        const summary = tasks.map((t: AgentTask) => ({
          id: t.id,
          agentKey: t.agentKey,
          status: t.status,
          completionScore: t.completionScore,
          evaluationResult: t.evaluationResult,
        }));
        return {
          success: true,
          actionId: request.actionId,
          message: `Spawned ${tasks.length} agents in parallel. ${tasks.filter((t: AgentTask) => t.evaluationResult === 'approved').length} approved.`,
          data: { tasks: summary },
          executionTimeMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          actionId: request.actionId,
          message: `agent.spawn_parallel error: ${err instanceof Error ? err.message : String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(spawnParallelAction);

  // ── 3. EVALUATE_AGENT_PAYLOAD ──────────────────────────────────────────────
  const evaluateAction: ActionHandler = {
    actionId: 'agent.evaluate_payload',
    name: 'Evaluate Agent Payload',
    category: 'automation',
    description: 'Trinity evaluates a returned agent payload against completion criteria. Inputs: taskId',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const { payload } = request;
      const start = Date.now();
      try {
        if (!payload?.taskId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'agent.evaluate_payload requires taskId in payload',
            executionTimeMs: Date.now() - start,
          };
        }
        const task = await evaluateAgentPayload(payload.taskId as string);
        return {
          success: true,
          actionId: request.actionId,
          message: `Evaluation complete: ${task.evaluationResult || task.status} (score: ${task.completionScore ?? 'N/A'})`,
          data: task,
          executionTimeMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          actionId: request.actionId,
          message: `agent.evaluate_payload error: ${err instanceof Error ? err.message : String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(evaluateAction);

  // ── 4. ESCALATE_TO_HELPAI ──────────────────────────────────────────────────
  const escalateAction: ActionHandler = {
    actionId: 'agent.escalate_helpai',
    name: 'Escalate to HelpAI',
    category: 'escalation',
    description: 'Passes a borderline agent payload to HelpAI for secondary evaluation. Inputs: taskId, agentKey, outputPayload, completionScore, flags',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const { payload } = request;
      const start = Date.now();
      try {
        if (!payload?.taskId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'agent.escalate_helpai requires taskId in payload',
            executionTimeMs: Date.now() - start,
          };
        }
        const { helpAIHandleEscalatedPayload } = await import('../helpai/helpAIOrchestrator');
        const result = await helpAIHandleEscalatedPayload({
          taskId: payload.taskId as string,
          agentKey: (payload.agentKey as string) || '',
          outputPayload: (payload.outputPayload as Record<string, unknown>) || {},
          completionScore: (payload.completionScore as number) || 0,
          flags: (payload.flags as unknown[]) || [],
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `HelpAI evaluation: ${result.verdict} (adjusted score: ${result.adjustedScore})`,
          data: result,
          executionTimeMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          actionId: request.actionId,
          message: `agent.escalate_helpai error: ${err instanceof Error ? err.message : String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(escalateAction);

  // ── 5. RETASK_AGENT ────────────────────────────────────────────────────────
  const retaskAction: ActionHandler = {
    actionId: 'agent.retask',
    name: 'Retask Agent',
    category: 'automation',
    description: 'Re-spawns a below-threshold agent using the original task parameters. Inputs: originalTaskId',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const { payload } = request;
      const start = Date.now();
      try {
        if (!payload?.originalTaskId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'agent.retask requires originalTaskId in payload',
            executionTimeMs: Date.now() - start,
          };
        }
        const { pool } = await import('../../db');
        // CATEGORY C — Raw SQL retained: Agent task lookup via pool.query | Tables: agent_tasks | Verified: 2026-03-23
        const taskResult = await pool.query<Record<string, unknown>>(
          `SELECT * FROM agent_tasks WHERE id = $1`,
          [payload.originalTaskId]
        );
        if (taskResult.rows.length === 0) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Task ${payload.originalTaskId} not found`,
            executionTimeMs: Date.now() - start,
          };
        }
        const orig = taskResult.rows[0];
        const inputPayload = typeof orig.input_payload === 'string'
          ? JSON.parse(orig.input_payload as string)
          : orig.input_payload as Record<string, unknown>;

        const task = await spawnAgent({
          workspaceId: orig.workspace_id as string,
          agentKey: orig.agent_key as string,
          taskType: orig.task_type as string,
          inputPayload,
          relatedEntityType: orig.related_entity_type as string | undefined,
          relatedEntityId: orig.related_entity_id as string | undefined,
          spawnedBy: 'trinity_retask',
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Retask complete — new task ${task.id}: ${task.status}, score: ${task.completionScore ?? 'N/A'}`,
          data: task,
          executionTimeMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          actionId: request.actionId,
          message: `agent.retask error: ${err instanceof Error ? err.message : String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(retaskAction);

  log.info('[Trinity Agent Spawning] Registered 5 actions: agent.spawn, agent.spawn_parallel, agent.evaluate_payload, agent.escalate_helpai, agent.retask');
}
