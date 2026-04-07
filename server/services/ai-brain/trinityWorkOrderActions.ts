/**
 * TRINITY WORK ORDER ACTIONS
 * ==========================
 * Registers work order system actions with AI Brain Orchestrator.
 * Enables Trinity to process work orders like an autonomous AI agent.
 */

import { helpaiOrchestrator, type ActionRequest } from '../helpai/platformActionHub';
import {
  trinityWorkOrderOrchestrator,
  trinityWorkOrderIntake,
  taskDecompositionEngine,
  clarificationProtocol,
  workSummaryEngine,
} from './trinityWorkOrderSystem';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityWorkOrderActions');

export function registerTrinityWorkOrderActions(): void {
  helpaiOrchestrator.registerAction({
    actionId: 'workorder.process',
    name: 'Process Work Order',
    description: 'Parse a user request into a structured work order and execute it with autonomous retry and reflection',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { rawRequest, autoExecute } = request.payload || {};
      
      if (!request.workspaceId) {
        return { success: false, actionId: 'workorder.process', message: 'Missing workspaceId — cannot process work order', executionTimeMs: Date.now() - startTime };
      }
      
      try {
        const result = await trinityWorkOrderOrchestrator.processWorkOrder(
          rawRequest || request.payload?.message || 'Process this request',
          request.workspaceId,
          request.userId,
        );
        
        return {
          success: true,
          actionId: 'workorder.process',
          message: result.needsClarification 
            ? `Clarification needed: ${result.clarificationQuestions?.length || 0} questions`
            : `Work order ${result.workOrder.status}: ${result.summary.outcome}`,
          data: {
            workOrderId: result.workOrder.id,
            intent: result.workOrder.intent,
            complexity: result.workOrder.complexity,
            status: result.workOrder.status,
            needsClarification: result.needsClarification,
            questions: result.clarificationQuestions?.map(q => q.question),
            summary: trinityWorkOrderOrchestrator.formatSummary(result.summary),
            commitDecision: result.commitDecision,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'workorder.process',
          message: `Failed to process work order: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'workorder.parse',
    name: 'Parse Work Order',
    description: 'Parse a natural language request into a structured work order without executing',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { rawRequest } = request.payload || {};
      
      if (!request.workspaceId) {
        return { success: false, actionId: 'workorder.parse', message: 'Missing workspaceId — cannot parse work order', executionTimeMs: Date.now() - startTime };
      }
      
      try {
        const workOrder = await trinityWorkOrderIntake.parseWorkOrder(
          rawRequest || 'Analyze this request',
          request.workspaceId,
          request.userId,
        );
        
        return {
          success: true,
          actionId: 'workorder.parse',
          message: `Parsed work order: ${workOrder.intent} (${workOrder.complexity})`,
          data: {
            id: workOrder.id,
            intent: workOrder.intent,
            urgency: workOrder.urgency,
            complexity: workOrder.complexity,
            summary: workOrder.summary,
            affectedAreas: workOrder.affectedAreas,
            successCriteria: workOrder.successCriteria,
            riskLevel: workOrder.riskLevel,
            riskFactors: workOrder.riskFactors,
            ambiguities: workOrder.ambiguities,
            clarificationRequired: workOrder.clarificationRequired,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'workorder.parse',
          message: `Failed to parse work order: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'workorder.decompose',
    name: 'Decompose Work Order',
    description: 'Break a work order into atomic executable tasks with dependencies',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workOrderId } = request.payload || {};
      
      try {
        const workOrder = trinityWorkOrderIntake.getWorkOrder(workOrderId);
        if (!workOrder) {
          return {
            success: false,
            actionId: 'workorder.decompose',
            message: 'Work order not found',
            executionTimeMs: Date.now() - startTime,
          };
        }
        
        const tasks = await taskDecompositionEngine.decompose(workOrder);
        
        return {
          success: true,
          actionId: 'workorder.decompose',
          message: `Decomposed into ${tasks.length} tasks`,
          data: {
            workOrderId,
            taskCount: tasks.length,
            tasks: tasks.map(t => ({
              id: t.id,
              title: t.title,
              actionType: t.actionType,
              dependsOn: t.dependsOn,
              status: t.status,
              estimatedMinutes: t.estimatedMinutes,
            })),
            readyTasks: tasks.filter(t => t.status === 'ready').length,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'workorder.decompose',
          message: `Failed to decompose: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'workorder.clarify',
    name: 'Provide Clarification',
    description: 'Provide clarification response for an ambiguous work order',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workOrderId, ambiguityId, resolution } = request.payload || {};
      
      try {
        trinityWorkOrderOrchestrator.provideClarification(workOrderId, ambiguityId, resolution);
        
        const workOrder = trinityWorkOrderIntake.getWorkOrder(workOrderId);
        const stillNeedsClarification = clarificationProtocol.shouldAskForClarification(workOrder!);
        
        return {
          success: true,
          actionId: 'workorder.clarify',
          message: stillNeedsClarification.shouldAsk 
            ? 'Clarification recorded, more questions remain'
            : 'All clarifications resolved, ready to proceed',
          data: {
            workOrderId,
            resolved: ambiguityId,
            remainingQuestions: stillNeedsClarification.questions.length,
            readyToProceed: !stillNeedsClarification.shouldAsk,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'workorder.clarify',
          message: `Failed to process clarification: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'workorder.status',
    name: 'Get Work Order Status',
    description: 'Get the current status and progress of a work order',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workOrderId } = request.payload || {};
      
      try {
        const workOrder = trinityWorkOrderIntake.getWorkOrder(workOrderId);
        if (!workOrder) {
          return {
            success: false,
            actionId: 'workorder.status',
            message: 'Work order not found',
            executionTimeMs: Date.now() - startTime,
          };
        }
        
        const tasks = taskDecompositionEngine.getTaskGraph(workOrderId);
        const completedTasks = tasks.filter(t => t.status === 'success').length;
        const failedTasks = tasks.filter(t => t.status === 'failed').length;
        const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'ready').length;
        
        return {
          success: true,
          actionId: 'workorder.status',
          message: `Work order ${workOrder.status}: ${completedTasks}/${tasks.length} tasks complete`,
          data: {
            id: workOrder.id,
            status: workOrder.status,
            intent: workOrder.intent,
            complexity: workOrder.complexity,
            progress: {
              total: tasks.length,
              completed: completedTasks,
              failed: failedTasks,
              pending: pendingTasks,
              percentComplete: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
            },
            createdAt: workOrder.createdAt,
            updatedAt: workOrder.updatedAt,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'workorder.status',
          message: `Failed to get status: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'workorder.get_summary',
    name: 'Get Work Summary',
    description: 'Generate a human-readable summary of completed work',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest) => {
      const startTime = Date.now();
      const { workOrderId } = request.payload || {};
      
      try {
        const workOrder = trinityWorkOrderIntake.getWorkOrder(workOrderId);
        if (!workOrder) {
          return {
            success: false,
            actionId: 'workorder.get_summary',
            message: 'Work order not found',
            executionTimeMs: Date.now() - startTime,
          };
        }
        
        const { solutionDiscoveryLoop } = await import('./trinityWorkOrderSystem');
        const attempts = solutionDiscoveryLoop.getAttempts(workOrderId);
        const summary = await workSummaryEngine.generateSummary(workOrder, attempts);
        const formatted = workSummaryEngine.formatForDisplay(summary);
        
        return {
          success: true,
          actionId: 'workorder.get_summary',
          message: `Summary generated for ${summary.outcome} work order`,
          data: {
            summary,
            formatted,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: 'workorder.get_summary',
          message: `Failed to generate summary: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  log.info('[TrinityWorkOrderActions] Registered 6 work order orchestration actions');
}
