import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { automationExecutions, shifts, employees, workspaces } from '@shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { tokenManager, TOKEN_COSTS } from '../services/billing/tokenManager';
import { aiTokenGateway } from '../services/billing/aiTokenGateway';
import { automationOrchestration } from '../services/orchestration/automationOrchestration';
import { platformEventBus } from '../services/platformEventBus';
import { type AuthenticatedRequest } from '../rbac';
import { requireAuth } from '../auth';
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('OrchestratedScheduleRoutes');


const router = Router();

router.use(requireAuth);

router.get('/status', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.workspaceId;
    const { pool } = await import('../db');
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: automation_executions | Verified: 2026-03-23
    const [execRow] = (await typedPool(
      `SELECT id, status, created_at, metadata
       FROM automation_executions
       WHERE workspace_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId || 'none']
    )).rows;
    res.json({
      service: 'orchestrated-schedule',
      status: execRow ? execRow.status : 'idle',
      lastExecutionId: execRow?.id || null,
      lastExecutionAt: execRow?.created_at || null,
      healthy: true,
    });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to fetch orchestrated schedule status' });
  }
});

interface CreditPreCheckResult {
  allowed: boolean;
  balance: number;
  cost: number;
  shortfall: number;
}

async function creditPreCheck(
  workspaceId: string,
  featureKey: keyof typeof TOKEN_COSTS,
  userId?: string
): Promise<CreditPreCheckResult> {
  const auth = await aiTokenGateway.preAuthorize(workspaceId, userId, featureKey);
  return {
    allowed: auth.authorized,
    balance: 0,
    cost: auth.classification.tokenCost,
    shortfall: 0,
  };
}

router.post('/ai/fill-shift', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;
    const { shiftId } = req.body;

    if (!workspaceId || !shiftId) {
      return res.status(400).json({ message: 'workspaceId and shiftId are required' });
    }

    const preCheck = await creditPreCheck(workspaceId, 'ai_open_shift_fill', userId);
    if (!preCheck.allowed) {
      return res.status(402).json({
        message: 'Insufficient credits for AI shift fill',
        creditsRequired: preCheck.cost,
        currentBalance: preCheck.balance,
        shortfall: preCheck.shortfall,
      });
    }

    const result = await automationOrchestration.executeAutomation(
      {
        domain: 'scheduling',
        automationName: 'ai_shift_fill',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        automationType: 'ai_call',
        workspaceId,
        userId: userId || 'system',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        triggeredBy: 'user',
        billable: true,
        creditCost: TOKEN_COSTS['ai_open_shift_fill'],
        maxRetries: 2,
      },
      async () => {
        const { scoreEmployeesForShift, getTopCandidates, formatCandidatesForAI } = await import('../services/automation/employeeScoring');
        const { scheduleSmartAI } = await import('../services/scheduleSmartAI');
        const { storage } = await import('../storage');

        const shift = await storage.getShift(shiftId, workspaceId);
        if (!shift) throw new Error('Shift not found');
        if (shift.employeeId) throw new Error('Shift is already assigned');

        const scoredCandidates = await scoreEmployeesForShift(workspaceId, {
          shiftId,
          requiredSkills: (shift as any).requiredSkills || [],
          requiredCertifications: shift.requiredCertifications || [],
          maxDistance: 50,
          maxPayRate: shift.payRate ? parseFloat(shift.payRate) : undefined,
        });

        if (scoredCandidates.length === 0) {
          throw new Error('No qualified employees available for this shift');
        }

        const topCandidates = getTopCandidates(scoredCandidates, 5);
        const vettedEmployees = topCandidates.map((c: any) => c.fullEmployee);

        const aiResult = await scheduleSmartAI({
          openShifts: [shift],
          availableEmployees: vettedEmployees,
          workspaceId,
          userId: userId || 'system',
          constraints: {
            hardConstraints: {
              respectAvailability: true,
              preventDoubleBooking: true,
              enforceRestPeriods: true,
              respectTimeOffRequests: true,
            },
            softConstraints: {
              preferExperience: true,
              balanceWorkload: true,
              respectPreferences: true,
            },
            predictiveMetrics: {
              enableReliabilityScoring: true,
              penalizeLateHistory: true,
              considerAbsenteeismRisk: true,
            }
          },
          // @ts-expect-error — TS migration: fix in refactoring sprint
          scoringContext: formatCandidatesForAI(topCandidates),
        });

        if (aiResult.assignments.length === 0) {
          throw new Error('AI could not find a suitable employee for this shift');
        }

        const assignment = aiResult.assignments[0];
        const updatedShift = await storage.updateShift(shiftId, workspaceId, {
          employeeId: assignment.employeeId,
          status: 'draft',
          aiGenerated: true,
          aiConfidenceScore: String(assignment.confidence || 0.85),
        });

        await aiTokenGateway.finalizeBilling(workspaceId, userId, 'ai_open_shift_fill', TOKEN_COSTS['ai_open_shift_fill']);

        return {
          shift: updatedShift,
          assignment,
          candidatesScored: scoredCandidates.length,
          confidence: assignment.confidence,
        };
      }
    );

    if (result.success) {
      platformEventBus.emit('schedule.ai_fill_complete', {
        workspaceId,
        shiftId,
        orchestrationId: result.orchestrationId,
        assignment: result.data?.assignment,
      });
    }

    res.json({
      success: result.success,
      orchestrationId: result.orchestrationId,
      data: result.data,
      creditsDeducted: result.success ? TOKEN_COSTS['ai_open_shift_fill'] : 0,
      error: result.error,
      remediation: result.remediation,
    });
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] AI fill error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fill shift' });
  }
});

router.post('/ai/trigger-session', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;
    const { mode = 'fill_gaps', weekStart: weekStartStr } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required' });
    }

    const validModes = ['optimize', 'fill_gaps', 'full_generate'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ message: 'Invalid mode' });
    }

    const costMap: Record<string, keyof typeof TOKEN_COSTS> = {
      'optimize': 'ai_schedule_optimization',
      'fill_gaps': 'ai_open_shift_fill',
      'full_generate': 'ai_scheduling',
    };
    const featureKey = costMap[mode];

    const preCheck = await creditPreCheck(workspaceId, featureKey, userId);
    if (!preCheck.allowed) {
      return res.status(402).json({
        message: `Insufficient credits for ${mode} operation`,
        creditsRequired: preCheck.cost,
        currentBalance: preCheck.balance,
        shortfall: preCheck.shortfall,
      });
    }

    const result = await automationOrchestration.executeAutomation(
      {
        domain: 'scheduling',
        automationName: `schedule_${mode}`,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        automationType: 'ai_call',
        workspaceId,
        userId: userId || 'system',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        triggeredBy: 'user',
        billable: true,
        creditCost: TOKEN_COSTS[featureKey],
        maxRetries: 2,
      },
      async () => {
        const { trinitySchedulingOrchestrator } = await import('../services/orchestration/trinitySchedulingOrchestrator');

        const sessionResult = await trinitySchedulingOrchestrator.startSchedulingSession({
          workspaceId,
          triggeredBy: userId || 'system',
          mode: mode as 'optimize' | 'fill_gaps' | 'full_generate',
          weekStart: weekStartStr ? new Date(weekStartStr) : undefined,
        });

        const shiftsProcessed = sessionResult?.totalMutations || 1;
        await aiTokenGateway.finalizeBilling(workspaceId, userId, featureKey, TOKEN_COSTS[featureKey], undefined, shiftsProcessed);

        return sessionResult;
      }
    );

    const shiftsProcessed = result.data?.totalMutations || 1;

    if (result.success) {
      platformEventBus.emit('schedule.session_complete', {
        workspaceId,
        orchestrationId: result.orchestrationId,
        mode,
        totalMutations: result.data?.totalMutations,
      });
    }

    res.json({
      success: result.success,
      orchestrationId: result.orchestrationId,
      sessionId: result.data?.sessionId,
      executionId: result.data?.executionId,
      totalMutations: result.data?.totalMutations,
      mutations: result.data?.mutations,
      summary: result.data?.summary,
      aiSummary: result.data?.aiSummary,
      requiresVerification: result.data?.requiresVerification,
      creditsDeducted: result.success ? TOKEN_COSTS[featureKey] * shiftsProcessed : 0,
      error: result.error,
      remediation: result.remediation,
    });
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] Session error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to start scheduling session' });
  }
});

router.get('/executions', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;
    const { limit = '10' } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required' });
    }

    const executions = await db
      .select()
      .from(automationExecutions)
      .where(
        and(
          eq(automationExecutions.workspaceId, workspaceId as string),
          eq(automationExecutions.actionType, 'ai_call')
        )
      )
      .orderBy(desc(automationExecutions.queuedAt))
      .limit(Math.min(parseInt(limit as string, 10), 50));

    res.json(executions);
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] Executions fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch executions' });
  }
});

router.get('/executions/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;

    const [execution] = await db
      .select()
      .from(automationExecutions)
      .where(eq(automationExecutions.id, executionId))
      .limit(1);

    if (!execution) {
      return res.status(404).json({ message: 'Execution not found' });
    }

    res.json(execution);
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] Execution fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch execution' });
  }
});

router.get('/orchestration/:orchestrationId/steps', async (req: Request, res: Response) => {
  try {
    const { orchestrationId } = req.params;
    const { universalStepLogger } = await import('../services/orchestration/universalStepLogger');
    
    const context = universalStepLogger.getOrchestration(orchestrationId);
    if (!context) {
      return res.status(404).json({ message: 'Orchestration not found or already completed' });
    }

    const steps = context.steps.map(s => ({
      step: s.step,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      error: s.error,
      errorCode: s.errorCode,
    }));

    res.json({
      orchestrationId: context.orchestrationId,
      domain: context.domain,
      actionName: context.actionName,
      status: context.status,
      steps,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
    });
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] Steps fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch orchestration steps' });
  }
});

router.get('/active-operations', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required' });
    }

    const { universalStepLogger } = await import('../services/orchestration/universalStepLogger');
    const active = universalStepLogger.getActiveOrchestrations(workspaceId as string);

    const operations = active.map(ctx => ({
      orchestrationId: ctx.orchestrationId,
      domain: ctx.domain,
      actionName: ctx.actionName,
      status: ctx.status,
      currentStep: ctx.steps[ctx.steps.length - 1]?.step || 'TRIGGER',
      stepStatus: ctx.steps[ctx.steps.length - 1]?.status || 'pending',
      steps: ctx.steps.map(s => ({
        step: s.step,
        status: s.status,
        durationMs: s.durationMs,
      })),
      createdAt: ctx.createdAt,
    }));

    res.json(operations);
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] Active operations error:', error);
    res.status(500).json({ message: 'Failed to fetch active operations' });
  }
});

router.get('/credit-status', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required' });
    }

    const account = await (tokenManager as any).getCreditsAccountWithStatus(
      workspaceId as string,
      userId
    );

    const scheduleCosts = {
      ai_shift_fill: TOKEN_COSTS['ai_open_shift_fill'],
      optimize: TOKEN_COSTS['ai_schedule_optimization'],
      fill_gaps: TOKEN_COSTS['ai_open_shift_fill'],
      full_generate: TOKEN_COSTS['ai_scheduling'],
      shift_matching: TOKEN_COSTS['ai_shift_matching'],
    };

    const canAfford = {
      ai_shift_fill: account.effectiveBalance >= scheduleCosts.ai_shift_fill,
      optimize: account.effectiveBalance >= scheduleCosts.optimize,
      fill_gaps: account.effectiveBalance >= scheduleCosts.fill_gaps,
      full_generate: account.effectiveBalance >= scheduleCosts.full_generate,
    };

    res.json({
      balance: account.effectiveBalance,
      unlimitedCredits: account.unlimited,
      monthlyAllocation: account.credits?.monthlyAllocation || 0,
      totalSpent: account.credits?.totalTokensUsed || 0,
      costs: scheduleCosts,
      canAfford,
    });
  } catch (error: unknown) {
    log.error('[OrchestratedSchedule] Credit status error:', error);
    res.status(500).json({ message: 'Failed to fetch credit status' });
  }
});

export default router;
