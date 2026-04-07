/**
 * ALTERNATIVE STRATEGY SERVICE
 * ============================
 * Generates ranked alternatives when actions fail.
 * Uses Trinity's parity layer to reflect and propose alternatives.
 * 
 * CRITICAL for launch: Enables Trinity to recover from failures gracefully.
 */

import { trinityAgentParityLayer } from '../trinityAgentParityLayer';
import { db } from '@/db';
import { employees, shifts, clients } from '@shared/schema';
import { eq, and, gte, lte, isNull, not } from 'drizzle-orm';
import { createLogger } from '../../../lib/logger';
const log = createLogger('alternativeStrategyService');

export interface FailedAction {
  type: string;
  parameters: Record<string, any>;
  error: string;
  attemptNumber: number;
}

export interface AlternativeStrategy {
  id: string;
  description: string;
  action: string;
  parameters: Record<string, any>;
  probability: number;
  estimatedCost: number;
  reasoning: string;
  tradeoffs: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AlternativeContext {
  workspaceId: string;
  goal: string;
  constraints?: string[];
  previousAttempts?: string[];
}

class AlternativeStrategyService {
  private static instance: AlternativeStrategyService;

  static getInstance(): AlternativeStrategyService {
    if (!AlternativeStrategyService.instance) {
      AlternativeStrategyService.instance = new AlternativeStrategyService();
    }
    return AlternativeStrategyService.instance;
  }

  /**
   * Generate ranked alternatives when an action fails
   */
  async generateAlternatives(
    failedAction: FailedAction,
    context: AlternativeContext
  ): Promise<AlternativeStrategy[]> {
    try {
      const alternatives: AlternativeStrategy[] = [];

      switch (failedAction.type.toUpperCase()) {
        case 'ASSIGN_EMPLOYEE':
        case 'ASSIGN_GUARD':
          alternatives.push(...await this.generateAssignmentAlternatives(failedAction, context));
          break;

        case 'CREATE_SHIFT':
          alternatives.push(...await this.generateShiftCreationAlternatives(failedAction, context));
          break;

        case 'SCHEDULE_SHIFT':
          alternatives.push(...await this.generateSchedulingAlternatives(failedAction, context));
          break;

        case 'UPDATE_SHIFT':
          alternatives.push(...await this.generateUpdateAlternatives(failedAction, context));
          break;

        default:
          alternatives.push(...await this.generateGenericAlternatives(failedAction, context));
      }

      const rankedAlternatives = this.rankAlternatives(alternatives);

      if (rankedAlternatives.length === 0) {
        rankedAlternatives.push(this.createFallbackAlternative(failedAction, context));
      }

      return rankedAlternatives.slice(0, 5);

    } catch (error) {
      log.error('[AlternativeStrategy] Error generating alternatives:', error);
      return [this.createFallbackAlternative(failedAction, context)];
    }
  }

  /**
   * Generate alternatives for employee assignment failures
   */
  private async generateAssignmentAlternatives(
    failedAction: FailedAction,
    context: AlternativeContext
  ): Promise<AlternativeStrategy[]> {
    const alternatives: AlternativeStrategy[] = [];
    const { parameters, error } = failedAction;
    const workspaceId = context.workspaceId;

    const availableEmployees = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ))
      .limit(10);

    if (error.includes('unavailable') || error.includes('conflict')) {
      for (const employee of availableEmployees) {
        if (employee.id.toString() !== parameters.employeeId) {
          alternatives.push({
            id: `alt-assign-${employee.id}`,
            description: `Assign ${employee.firstName} ${employee.lastName} instead`,
            action: 'ASSIGN_EMPLOYEE',
            parameters: {
              ...parameters,
              employeeId: employee.id.toString(),
              originalEmployeeId: parameters.employeeId
            },
            probability: 0.7,
            estimatedCost: this.estimateReassignmentCost(employee),
            reasoning: 'Original employee unavailable, suggesting alternative qualified employee',
            tradeoffs: ['Different employee may have different skills or pay rate'],
            riskLevel: 'low'
          });
        }
      }
    }

    if (error.includes('overtime') || error.includes('hours')) {
      alternatives.push({
        id: 'alt-split-shift',
        description: 'Split shift between two employees to avoid overtime',
        action: 'SPLIT_SHIFT_ASSIGNMENT',
        parameters: {
          ...parameters,
          splitPoint: 'midpoint',
          employees: availableEmployees.slice(0, 2).map(e => e.id)
        },
        probability: 0.6,
        estimatedCost: 0,
        reasoning: 'Splitting shift avoids overtime costs',
        tradeoffs: ['Requires handoff between employees', 'May affect continuity'],
        riskLevel: 'medium'
      });
    }

    if (error.includes('qualification') || error.includes('skill')) {
      alternatives.push({
        id: 'alt-supervised-assignment',
        description: 'Assign with supervisor oversight for training',
        action: 'ASSIGN_EMPLOYEE_WITH_SUPERVISION',
        parameters: {
          ...parameters,
          requiresSupervision: true
        },
        probability: 0.5,
        estimatedCost: 50,
        reasoning: 'Employee can work under supervision while training',
        tradeoffs: ['Additional supervision cost', 'Lower initial productivity'],
        riskLevel: 'medium'
      });
    }

    return alternatives;
  }

  /**
   * Generate alternatives for shift creation failures
   */
  private async generateShiftCreationAlternatives(
    failedAction: FailedAction,
    context: AlternativeContext
  ): Promise<AlternativeStrategy[]> {
    const alternatives: AlternativeStrategy[] = [];
    const { parameters, error } = failedAction;

    if (error.includes('overlap') || error.includes('conflict')) {
      alternatives.push({
        id: 'alt-adjust-time',
        description: 'Adjust shift time to avoid conflict',
        action: 'CREATE_SHIFT',
        parameters: {
          ...parameters,
          startTime: this.adjustTime(parameters.startTime, 1),
          endTime: this.adjustTime(parameters.endTime, 1)
        },
        probability: 0.8,
        estimatedCost: 0,
        reasoning: 'Shifting time by 1 hour avoids scheduling conflict',
        tradeoffs: ['Slightly different coverage time'],
        riskLevel: 'low'
      });

      alternatives.push({
        id: 'alt-shorten-shift',
        description: 'Create shorter shift to fit available slot',
        action: 'CREATE_SHIFT',
        parameters: {
          ...parameters,
          endTime: this.adjustTime(parameters.startTime, 4)
        },
        probability: 0.6,
        estimatedCost: 0,
        reasoning: 'Shorter shift fits in available time slot',
        tradeoffs: ['Less coverage time'],
        riskLevel: 'low'
      });
    }

    if (error.includes('minimum') || error.includes('duration')) {
      alternatives.push({
        id: 'alt-extend-shift',
        description: 'Extend shift to meet minimum duration',
        action: 'CREATE_SHIFT',
        parameters: {
          ...parameters,
          endTime: this.adjustTime(parameters.startTime, 4)
        },
        probability: 0.9,
        estimatedCost: 0,
        reasoning: 'Extended shift meets minimum duration requirements',
        tradeoffs: ['Longer shift may cost more'],
        riskLevel: 'low'
      });
    }

    return alternatives;
  }

  /**
   * Generate alternatives for scheduling failures
   */
  private async generateSchedulingAlternatives(
    failedAction: FailedAction,
    context: AlternativeContext
  ): Promise<AlternativeStrategy[]> {
    const alternatives: AlternativeStrategy[] = [];
    const { parameters, error } = failedAction;

    alternatives.push({
      id: 'alt-next-day',
      description: 'Schedule for next available day',
      action: 'SCHEDULE_SHIFT',
      parameters: {
        ...parameters,
        date: this.getNextDay(parameters.date)
      },
      probability: 0.7,
      estimatedCost: 0,
      reasoning: 'Next day may have better availability',
      tradeoffs: ['Coverage gap for original day'],
      riskLevel: 'low'
    });

    alternatives.push({
      id: 'alt-partial-coverage',
      description: 'Create partial coverage with available resources',
      action: 'SCHEDULE_PARTIAL_COVERAGE',
      parameters: {
        ...parameters,
        coverageType: 'partial',
        minimumHours: 4
      },
      probability: 0.5,
      estimatedCost: 0,
      reasoning: 'Some coverage is better than no coverage',
      tradeoffs: ['Incomplete coverage for the period'],
      riskLevel: 'medium'
    });

    return alternatives;
  }

  /**
   * Generate alternatives for update failures
   */
  private async generateUpdateAlternatives(
    failedAction: FailedAction,
    context: AlternativeContext
  ): Promise<AlternativeStrategy[]> {
    const alternatives: AlternativeStrategy[] = [];
    const { parameters, error } = failedAction;

    if (error.includes('lock') || error.includes('frozen')) {
      alternatives.push({
        id: 'alt-request-unlock',
        description: 'Request supervisor approval to unlock for edit',
        action: 'REQUEST_EDIT_APPROVAL',
        parameters: {
          ...parameters,
          requiresApproval: true,
          reason: 'Schedule adjustment needed'
        },
        probability: 0.6,
        estimatedCost: 0,
        reasoning: 'Escalate to supervisor for approval',
        tradeoffs: ['Requires manual approval step', 'May delay action'],
        riskLevel: 'low'
      });
    }

    alternatives.push({
      id: 'alt-create-replacement',
      description: 'Create new shift instead of modifying locked one',
      action: 'CREATE_SHIFT',
      parameters: {
        ...parameters,
        replaces: parameters.shiftId
      },
      probability: 0.7,
      estimatedCost: 0,
      reasoning: 'Creating new shift bypasses locked record',
      tradeoffs: ['Original shift remains unchanged'],
      riskLevel: 'medium'
    });

    return alternatives;
  }

  /**
   * Generate generic alternatives using AI reflection
   */
  private async generateGenericAlternatives(
    failedAction: FailedAction,
    context: AlternativeContext
  ): Promise<AlternativeStrategy[]> {
    try {
      const reflection = await trinityAgentParityLayer.reflect({
        goal: context.goal,
        previousAttempts: [
          {
            attempt: failedAction.attemptNumber,
            action: failedAction.type,
            result: 'failed',
            error: failedAction.error
          }
        ],
        constraints: context.constraints || []
      });

      return [{
        id: 'alt-ai-suggested',
        description: reflection.nextAction?.description || 'AI-suggested alternative approach',
        action: reflection.nextAction?.action || failedAction.type,
        parameters: reflection.nextAction?.parameters || failedAction.parameters,
        probability: reflection.confidence || 0.5,
        estimatedCost: 0,
        reasoning: reflection.reasoning || 'AI-generated alternative based on failure analysis',
        tradeoffs: ['May require additional validation'],
        riskLevel: 'medium'
      }];
    } catch (error) {
      log.error('[AlternativeStrategy] AI reflection failed:', error);
      return [];
    }
  }

  /**
   * Rank alternatives by success probability and cost
   */
  private rankAlternatives(alternatives: AlternativeStrategy[]): AlternativeStrategy[] {
    return alternatives.sort((a, b) => {
      const scoreA = (a.probability * 100) - (a.estimatedCost * 0.1) - (a.riskLevel === 'high' ? 20 : a.riskLevel === 'medium' ? 10 : 0);
      const scoreB = (b.probability * 100) - (b.estimatedCost * 0.1) - (b.riskLevel === 'high' ? 20 : b.riskLevel === 'medium' ? 10 : 0);
      return scoreB - scoreA;
    });
  }

  /**
   * Create a fallback alternative when no other options exist
   */
  private createFallbackAlternative(
    failedAction: FailedAction,
    context: AlternativeContext
  ): AlternativeStrategy {
    return {
      id: 'alt-manual-review',
      description: 'Flag for manual review by supervisor',
      action: 'ESCALATE_TO_SUPERVISOR',
      parameters: {
        originalAction: failedAction.type,
        originalParameters: failedAction.parameters,
        error: failedAction.error,
        goal: context.goal
      },
      probability: 0.9,
      estimatedCost: 10,
      reasoning: 'No automated alternatives available - escalating to human review',
      tradeoffs: ['Requires manual intervention', 'May delay resolution'],
      riskLevel: 'low'
    };
  }

  private estimateReassignmentCost(employee: any): number {
    return 0;
  }

  private adjustTime(timeString: string, hoursToAdd: number): string {
    const date = new Date(timeString);
    date.setHours(date.getHours() + hoursToAdd);
    return date.toISOString();
  }

  private getNextDay(dateString: string): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return date.toISOString();
  }
}

export const alternativeStrategyService = AlternativeStrategyService.getInstance();
