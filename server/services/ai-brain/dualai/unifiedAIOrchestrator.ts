/**
 * Unified AI Orchestrator - Central coordination between Trinity and Claude
 * 
 * This is the main entry point for the Dual-AI system. It handles:
 * - Task routing based on AI strengths
 * - Context sharing between AIs
 * - Coordination of collaborative workflows
 * - Audit logging of all decisions
 */

import { taskRouter, type TaskType, type TaskRoutingDecision, type AIProvider } from './taskRouter';
import { claudeService, type ClaudeRequest } from './claudeService';
import { claudeVerificationService, type VerificationResult } from './claudeVerificationService';
import { trinityConfidenceScorer, type TrinityOperation, type ConfidenceScore } from './trinityConfidenceScorer';
import { aiActionLogger, type AIActionContext } from './aiActionLogger';
import { geminiClient } from '../providers/geminiClient';
import { resilientAIGateway } from '../providers/resilientAIGateway';
import { strategicOptimizationService } from '../strategicOptimizationService';
import { growthStrategist } from '../growthStrategist';
import { holisticGrowthEngine } from '../holisticGrowthEngine';
import { trinityThoughtEngine } from '../trinityThoughtEngine';
import { db } from '../../../db';
import { employees, clients, invoices } from '@shared/schema';
import { eq, sql, count } from 'drizzle-orm';
import { createLogger } from '../../../lib/logger';
const log = createLogger('unifiedAIOrchestrator');

const EXECUTIVE_TASK_TYPES: TaskType[] = [
  'ceo_briefing',
  'cfo_dashboard',
  'risk_assessment',
  'support_escalation',
  'training_content',
];

export interface OrchestratorRequest {
  sessionId: string;
  task: string;
  taskType?: TaskType;
  dataNeeds?: string[];
  userId?: string;
  workspaceId?: string;
  additionalContext?: Record<string, any>;
  forceAi?: 'trinity' | 'claude' | 'gpt4';
}

export interface OrchestratorResponse {
  success: boolean;
  content: string;
  primaryAi: 'trinity' | 'claude' | 'gpt4';
  supportAi?: 'trinity' | 'claude' | 'gpt4';
  collaborationType?: string;
  creditsUsed: number;
  latencyMs: number;
  sessionId: string;
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  result?: any;
  reason?: string;
  details?: string;
  verification?: VerificationResult;
}

class UnifiedAIOrchestrator {
  private sessionContexts: Map<string, { previousInteractions: any[]; trinityInsights: any[] }> = new Map();

  async processRequest(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now();

    const context: AIActionContext = {
      sessionId: request.sessionId,
      workspaceId: request.workspaceId,
      userId: request.userId,
      task: request.task,
    };

    const taskType = request.taskType || taskRouter.inferTaskType(request.task);
    context.taskType = taskType;

    let routing: TaskRoutingDecision;
    if (request.forceAi) {
      routing = {
        primaryAi: request.forceAi,
        reason: `Forced to ${request.forceAi} by request`,
        estimatedCredits: 10,
      };
    } else {
      routing = taskRouter.routeTask(taskType, request.dataNeeds);
    }

    await aiActionLogger.log({
      actionType: 'orchestrator_routing_decision',
      context,
      collaboration: {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        primaryAi: routing.primaryAi,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        supportAi: routing.supportAi,
        collaborationType: routing.collaborationType,
        routingDecision: routing.reason,
      },
      requestData: { taskType, dataNeeds: request.dataNeeds },
    });

    try {
      if (EXECUTIVE_TASK_TYPES.includes(taskType)) {
        request = await this.enrichExecutiveContext(request, taskType);
      }

      let result: OrchestratorResponse;

      if (routing.primaryAi === 'claude') {
        result = await this.executeClaudeTask(request, routing, context, startTime);
      } else if (routing.primaryAi === 'gpt4') {
        result = await this.executeGPT4Task(request, routing, context, startTime);
      } else {
        result = await this.executeTrinityTask(request, routing, context, startTime);
      }

      this.updateSessionContext(request.sessionId, {
        userRequest: request.task,
        aiResponse: result.content.substring(0, 500),
        handledBy: result.primaryAi,
      });

      return result;
    } catch (error: any) {
      await aiActionLogger.log({
        actionType: 'orchestrator_request_failed',
        context,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        collaboration: { primaryAi: routing.primaryAi },
        success: false,
        errorMessage: (error instanceof Error ? error.message : String(error)),
        metrics: { durationMs: Date.now() - startTime },
      });

      throw error;
    }
  }

  private async executeClaudeTask(
    request: OrchestratorRequest,
    routing: TaskRoutingDecision,
    context: AIActionContext,
    startTime: number
  ): Promise<OrchestratorResponse> {
    let trinityData: Record<string, any> | undefined;

    if (routing.supportAi === 'trinity' && routing.dataNeeds && routing.dataNeeds.length > 0) {
      trinityData = await this.gatherTrinityData(routing.dataNeeds, request);
    }

    const sessionContext = this.sessionContexts.get(request.sessionId);

    const claudeRequest: ClaudeRequest = {
      task: request.task,
      taskType: context.taskType,
      context,
      trinityData,
      trinityInsights: sessionContext?.trinityInsights,
    };

    const response = await claudeService.processRequest(claudeRequest);

    return {
      success: true,
      content: response.content,
      primaryAi: 'claude',
      supportAi: routing.supportAi,
      collaborationType: routing.collaborationType,
      creditsUsed: response.creditsUsed,
      latencyMs: Date.now() - startTime,
      sessionId: request.sessionId,
      metadata: {
        tokensUsed: response.tokensUsed,
        trinityDataProvided: !!trinityData,
      },
    };
  }

  private async executeTrinityTask(
    request: OrchestratorRequest,
    routing: TaskRoutingDecision,
    context: AIActionContext,
    startTime: number
  ): Promise<OrchestratorResponse> {
    const response = await resilientAIGateway.callWithFallback({
      prompt: request.task,
      context: request.additionalContext,
      domain: context.taskType,
      workspaceId: request.workspaceId,
      userId: request.userId,
    });

    await aiActionLogger.logTrinityAction({
      actionType: 'trinity_task_completed',
      context,
      requestData: { task: request.task },
      responseData: { contentLength: response.content.length },
      routingDecision: routing.reason,
      metrics: {
        durationMs: Date.now() - startTime,
      },
    });

    return {
      success: true,
      content: response.content,
      primaryAi: 'trinity',
      collaborationType: routing.collaborationType,
      creditsUsed: 0,
      latencyMs: Date.now() - startTime,
      sessionId: request.sessionId,
    };
  }

  private async executeGPT4Task(
    request: OrchestratorRequest,
    routing: TaskRoutingDecision,
    context: AIActionContext,
    startTime: number
  ): Promise<OrchestratorResponse> {
    const response = await resilientAIGateway.callWithFallback({
      prompt: request.task,
      context: { ...request.additionalContext, preferredProvider: 'openai' },
      domain: context.taskType,
      workspaceId: request.workspaceId,
      userId: request.userId,
    });

    await aiActionLogger.logTrinityAction({
      actionType: 'gpt4_task_completed',
      context,
      requestData: { task: request.task },
      responseData: { contentLength: response.content.length },
      routingDecision: routing.reason,
      metrics: { durationMs: Date.now() - startTime },
    });

    return {
      success: true,
      content: response.content,
      primaryAi: 'gpt4',
      supportAi: routing.supportAi,
      collaborationType: routing.collaborationType,
      creditsUsed: taskRouter.getCreditEstimate(context.taskType as TaskType),
      latencyMs: Date.now() - startTime,
      sessionId: request.sessionId,
      metadata: { provider: 'openai' },
    };
  }

  async executeWithVerification(
    operation: TrinityOperation,
    context: AIActionContext
  ): Promise<ExecutionResult> {
    const confidence = trinityConfidenceScorer.calculateConfidence(operation);

    await aiActionLogger.logTrinityAction({
      actionType: 'trinity_confidence_calculated',
      context,
      requestData: {
        operationType: operation.type,
        confidenceScore: confidence.score,
        concerns: confidence.concerns,
      },
      metrics: { confidenceScore: confidence.score },
    });

    if (!confidence.recommendation.shouldVerify) {
      await aiActionLogger.logTrinityAction({
        actionType: 'trinity_executing_without_verification',
        context,
        requestData: { reason: confidence.recommendation.reason },
      });

      return { success: true, result: operation.data };
    }

    const verification = await claudeVerificationService.verify({
      operation,
      trinityConfidence: confidence,
      trinityProposedAction: operation.data,
      context,
    });

    if (verification.approved) {
      const finalData = verification.suggestedModifications || operation.data;

      return {
        success: true,
        result: finalData,
        verification,
      };
    }

    return {
      success: false,
      reason: 'Rejected by Claude verification',
      details: verification.rejectionReason || undefined,
      verification,
    };
  }

  async requestClaudeConsultation(params: {
    topic: string;
    question: string;
    trinityContext: any;
    context: AIActionContext;
  }): Promise<{ response: string; creditsUsed: number }> {
    const consultation = await claudeService.consult(params);

    this.addTrinityInsight(params.context.sessionId, {
      insight: `Claude consultation on ${params.topic}: ${consultation.response.substring(0, 200)}...`,
      timestamp: new Date(),
    });

    return {
      response: consultation.response,
      creditsUsed: consultation.creditsUsed,
    };
  }

  private async gatherTrinityData(
    dataNeeds: string[],
    request: OrchestratorRequest
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    for (const need of dataNeeds) {
      try {
        data[need] = await this.fetchDataByType(need, request);
      } catch (error) {
        log.error(`[UnifiedAIOrchestrator] Failed to gather data for ${need}:`, error);
        data[need] = { error: 'Failed to retrieve', type: need };
      }
    }

    return data;
  }

  private async fetchDataByType(
    dataType: string,
    request: OrchestratorRequest
  ): Promise<any> {
    const workspaceId = request.workspaceId;
    if (!workspaceId) {
      return { type: dataType, status: 'no_workspace_context', message: 'No workspace ID available to query data' };
    }

    try {
      switch (dataType) {
        case 'company_stats': {
          const [empCount] = await db.select({ count: count() }).from(employees).where(eq(employees.workspaceId, workspaceId));
          const [clientCount] = await db.select({ count: count() }).from(clients).where(eq(clients.workspaceId, workspaceId));
          return {
            employeeCount: empCount?.count || 0,
            activeClients: clientCount?.count || 0,
            source: 'live_database',
          };
        }
        case 'financial_metrics': {
          const [invStats] = await db.select({
            totalInvoiced: sql<string>`COALESCE(SUM(CASE WHEN status != 'void' THEN total ELSE 0 END), 0)`,
            totalPaid: sql<string>`COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0)`,
            totalOutstanding: sql<string>`COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END), 0)`,
          }).from(invoices).where(eq(invoices.workspaceId, workspaceId));
          return {
            totalInvoiced: parseFloat(invStats?.totalInvoiced || '0'),
            totalPaid: parseFloat(invStats?.totalPaid || '0'),
            totalOutstanding: parseFloat(invStats?.totalOutstanding || '0'),
            source: 'live_database',
          };
        }
        case 'compliance_status': {
          const [empCerts] = await db.select({ count: count() }).from(employees).where(eq(employees.workspaceId, workspaceId));
          return {
            totalEmployees: empCerts?.count || 0,
            note: 'Detailed compliance data available via compliance dashboard',
            source: 'live_database',
          };
        }
        case 'officer_certifications': {
          const [certStats] = await db.select({ count: count() }).from(employees).where(eq(employees.workspaceId, workspaceId));
          return {
            totalEmployees: certStats?.count || 0,
            note: 'Detailed certification data available via compliance dashboard',
            source: 'live_database',
          };
        }
        default:
          return { type: dataType, status: 'no_data_available', message: `No handler for data type: ${dataType}` };
      }
    } catch (error: any) {
      log.error(`[UnifiedAIOrchestrator] Error fetching ${dataType} for workspace ${workspaceId}:`, (error instanceof Error ? error.message : String(error)));
      return { type: dataType, status: 'query_error', error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  async summonTriad(params: {
    question: string;
    context: AIActionContext;
    workspaceId?: string;
  }): Promise<{
    trinityView: string;
    claudeView: string;
    gpt4View: string;
    consensus: string;
    confidenceLevel: number;
  }> {
    const startTime = Date.now();

    await trinityThoughtEngine.perceive(
      `TRIAD SUMMONED: "${params.question.substring(0, 200)}" — all three AIs weighing in`,
      { workspaceId: params.workspaceId, triggeredBy: 'summonTriad' }
    );

    const triadPrompt = `You are one of three AI advisors evaluating a critical business decision for a workforce management platform. Provide your perspective concisely (3-5 sentences). Focus on your area of expertise.\n\nQuestion: ${params.question}`;

    const [trinityResult, claudeResult, gpt4Result] = await Promise.allSettled([
      resilientAIGateway.callWithFallback({
        prompt: `[TRINITY — CEO/Orchestrator perspective: data, operations, automation]\n\n${triadPrompt}`,
        context: { role: 'trinity_ceo', triad: true },
        domain: 'triad_deliberation',
        workspaceId: params.workspaceId,
      }),
      claudeService.processRequest({
        task: `[CLAUDE — CFO/Specialist perspective: compliance, risk, financial reasoning]\n\n${triadPrompt}`,
        taskType: 'strategic_planning',
        context: params.context,
      }),
      resilientAIGateway.callWithFallback({
        prompt: `[GPT-4 — Support/Analyst perspective: user impact, communication, training]\n\n${triadPrompt}`,
        context: { role: 'gpt4_analyst', triad: true, preferredProvider: 'openai' },
        domain: 'triad_deliberation',
        workspaceId: params.workspaceId,
      }),
    ]);

    const trinityView = trinityResult.status === 'fulfilled' ? trinityResult.value.content : 'Trinity unavailable for this deliberation';
    const claudeView = claudeResult.status === 'fulfilled' ? claudeResult.value.content : 'Claude unavailable for this deliberation';
    const gpt4View = gpt4Result.status === 'fulfilled' ? gpt4Result.value.content : 'GPT-4 unavailable for this deliberation';

    const availableCount = [trinityResult, claudeResult, gpt4Result].filter(r => r.status === 'fulfilled').length;
    const confidenceLevel = availableCount / 3;

    const consensusPrompt = `Three AI advisors provided perspectives on: "${params.question}"\n\nTrinity (CEO): ${trinityView}\n\nClaude (CFO): ${claudeView}\n\nGPT-4 (Analyst): ${gpt4View}\n\nSynthesize a consensus recommendation in 2-3 sentences. Note any disagreements.`;

    let consensus: string;
    try {
      const consensusResult = await resilientAIGateway.callWithFallback({
        prompt: consensusPrompt,
        context: { role: 'consensus_builder' },
        domain: 'triad_consensus',
      });
      consensus = consensusResult.content;
    } catch {
      consensus = `Triad provided ${availableCount}/3 perspectives. Review individual views for decision.`;
    }

    await trinityThoughtEngine.deliberate(
      `TRIAD CONSENSUS: ${consensus.substring(0, 300)}`,
      [trinityView.substring(0, 200), claudeView.substring(0, 200), gpt4View.substring(0, 200)],
      confidenceLevel,
      { workspaceId: params.workspaceId, triggeredBy: 'summonTriad' }
    );

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await aiActionLogger.log({
      actionType: 'triad_summoned',
      context: params.context,
      requestData: { question: params.question },
      responseData: { consensus: consensus.substring(0, 500), availableCount },
      metrics: { durationMs: Date.now() - startTime },
    });

    return { trinityView, claudeView, gpt4View, consensus, confidenceLevel };
  }

  async escalateOnConfusion(params: {
    originalTask: string;
    confusionSignals: { lowConfidence: boolean; multipleRetries: boolean; ambiguousInput: boolean; conflictingInformation: boolean; missingContext: boolean };
    trinityAttemptedResponse?: string;
    context: AIActionContext;
  }): Promise<OrchestratorResponse> {
    const startTime = Date.now();

    const activeSignals = Object.entries(params.confusionSignals)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    await trinityThoughtEngine.doubt(
      `CONFUSION ESCALATION: Trinity confused on "${params.originalTask.substring(0, 200)}". Signals: ${activeSignals.join(', ')}`,
      0.3,
      { workspaceId: params.context.workspaceId, triggeredBy: 'escalateOnConfusion' }
    );

    const escalationPrompt = `Trinity (our CEO AI) encountered confusion processing this request and is escalating to you for expert handling.

Confusion signals: ${activeSignals.join(', ')}
${params.trinityAttemptedResponse ? `Trinity's partial attempt: ${params.trinityAttemptedResponse.substring(0, 500)}` : ''}

Original request: ${params.originalTask}

Please provide a clear, authoritative response. If Trinity's attempt was partially correct, build on it. If the request is genuinely ambiguous, explain what clarification is needed.`;

    const claudeResponse = await claudeService.processRequest({
      task: escalationPrompt,
      taskType: 'support_escalation',
      context: params.context,
    });

    await trinityThoughtEngine.learnFromOutcome(
      `Escalated "${params.originalTask.substring(0, 100)}" to Claude due to: ${activeSignals.join(', ')}`,
      'failure',
      'confusion_escalation',
      { workspaceId: params.context.workspaceId }
    );

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await aiActionLogger.log({
      actionType: 'confusion_escalated_to_claude',
      context: params.context,
      requestData: { originalTask: params.originalTask, confusionSignals: activeSignals },
      metrics: { durationMs: Date.now() - startTime },
    });

    return {
      success: true,
      content: claudeResponse.content,
      primaryAi: 'claude',
      supportAi: 'trinity',
      collaborationType: 'task_handoff',
      creditsUsed: claudeResponse.creditsUsed,
      latencyMs: Date.now() - startTime,
      sessionId: params.context.sessionId,
      metadata: { escalationReason: 'confusion', confusionSignals: activeSignals },
    };
  }

  async verifyFinancialResult(params: {
    description: string;
    inputs: Record<string, number>;
    aiProposedResult: number;
    context: AIActionContext;
  }): Promise<{
    verified: boolean;
    deterministicResult: number;
    discrepancy: number;
    integrityCheck: { passed: boolean; violations: string[] };
    shouldBlock: boolean;
  }> {
    const integrityCheck = trinityConfidenceScorer.preCheckFinancialIntegrity(params.inputs);

    const verifiedInputs = integrityCheck.passed ? params.inputs : integrityCheck.correctedValues;

    let deterministicResult = 0;
    const inputValues = Object.values(verifiedInputs);

    if (params.description.toLowerCase().includes('sum') || params.description.toLowerCase().includes('total')) {
      deterministicResult = inputValues.reduce((sum, v) => {
        const cents = Math.round(v * 100);
        return sum + cents;
      }, 0) / 100;
    } else if (params.description.toLowerCase().includes('tax') || params.description.toLowerCase().includes('rate')) {
      const base = verifiedInputs['base'] || verifiedInputs['subtotal'] || verifiedInputs['amount'] || inputValues[0] || 0;
      const rate = verifiedInputs['rate'] || verifiedInputs['taxRate'] || inputValues[1] || 0;
      deterministicResult = Math.round(base * rate * 100) / 100;
    } else {
      deterministicResult = Math.round(inputValues.reduce((s, v) => s + v, 0) * 100) / 100;
    }

    const discrepancy = Math.abs(params.aiProposedResult - deterministicResult);
    const toleranceCents = 1;
    const verified = discrepancy <= toleranceCents / 100;
    const shouldBlock = discrepancy > 0.01 || !integrityCheck.passed;

    await trinityThoughtEngine.verifyMath(
      params.description,
      params.inputs,
      deterministicResult,
      params.aiProposedResult,
      { workspaceId: params.context.workspaceId, triggeredBy: 'verifyFinancialResult' }
    );

    if (!verified) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await aiActionLogger.log({
        actionType: 'financial_math_discrepancy_blocked',
        context: params.context,
        requestData: {
          description: params.description,
          aiProposed: params.aiProposedResult,
          deterministic: deterministicResult,
          discrepancy,
        },
        success: false,
        errorMessage: `Financial discrepancy of $${discrepancy.toFixed(2)} detected`,
      });
    }

    return { verified, deterministicResult, discrepancy, integrityCheck, shouldBlock };
  }

  private updateSessionContext(
    sessionId: string,
    interaction: { userRequest: string; aiResponse: string; handledBy: AIProvider }
  ) {
    let context = this.sessionContexts.get(sessionId);
    if (!context) {
      context = { previousInteractions: [], trinityInsights: [] };
      this.sessionContexts.set(sessionId, context);
    }

    context.previousInteractions.push({
      ...interaction,
      timestamp: new Date(),
    });

    if (context.previousInteractions.length > 10) {
      context.previousInteractions = context.previousInteractions.slice(-10);
    }
  }

  private addTrinityInsight(sessionId: string, insight: { insight: string; timestamp: Date }) {
    let context = this.sessionContexts.get(sessionId);
    if (!context) {
      context = { previousInteractions: [], trinityInsights: [] };
      this.sessionContexts.set(sessionId, context);
    }

    context.trinityInsights.push(insight);

    if (context.trinityInsights.length > 5) {
      context.trinityInsights = context.trinityInsights.slice(-5);
    }
  }

  private async enrichExecutiveContext(
    request: OrchestratorRequest,
    taskType: TaskType
  ): Promise<OrchestratorRequest> {
    const workspaceId = request.workspaceId;
    if (!workspaceId) {
      return request;
    }

    const enrichedRequest = { ...request };
    const existingContext = enrichedRequest.additionalContext || {};

    try {
      switch (taskType) {
        case 'ceo_briefing': {
          const [healthReport, strategicContext, strategySummary] = await Promise.all([
            holisticGrowthEngine.analyzeBusinessHealth(workspaceId).catch(() => null),
            strategicOptimizationService.generateStrategicContext(workspaceId).catch(() => null),
            growthStrategist.getStrategySummary(workspaceId).catch(() => null),
          ]);

          const executiveData: Record<string, any> = {};
          if (healthReport) {
            executiveData.businessHealth = {
              healthScore: healthReport.healthScore,
              healthStatus: healthReport.healthStatus,
              financials: healthReport.financials,
              manpower: healthReport.manpower,
              executiveSummary: healthReport.executiveSummary,
              topRecommendation: healthReport.topRecommendation,
              goals: healthReport.goals,
            };
          }
          if (strategicContext) {
            executiveData.teamPerformance = {
              totalEmployees: strategicContext.summary.totalEmployees,
              topPerformers: strategicContext.summary.topPerformers,
              problematicEmployees: strategicContext.summary.problematicEmployees,
              enterpriseClients: strategicContext.summary.enterpriseClients,
              atRiskClients: strategicContext.summary.atRiskClients,
            };
          }
          if (strategySummary) {
            executiveData.growthStrategy = {
              empireScore: strategySummary.empireScore,
              cashOnTable: strategySummary.cashOnTable,
              opportunityCount: strategySummary.opportunityCount,
              topOpportunity: strategySummary.topOpportunity?.title || null,
              insight: strategySummary.trinityInsight,
            };
          }

          enrichedRequest.task = `[EXECUTIVE CEO BRIEFING]\n\nContext Data:\n${JSON.stringify(executiveData, null, 2)}\n\nOriginal Request: ${request.task}\n\nProvide an executive-level CEO briefing that includes:\n1. Business health overview with key metrics\n2. Financial performance summary (revenue trends, margins, cashflow)\n3. Workforce performance highlights (top performers, utilization, capacity)\n4. Strategic opportunities and risks requiring CEO attention\n5. Key decisions needed with recommended actions\n6. Growth trajectory and empire score assessment`;
          enrichedRequest.additionalContext = { ...existingContext, executiveEnrichment: 'ceo_briefing', executiveData };
          break;
        }

        case 'cfo_dashboard': {
          const [healthReport, strategicContext] = await Promise.all([
            holisticGrowthEngine.analyzeBusinessHealth(workspaceId).catch(() => null),
            strategicOptimizationService.generateStrategicContext(workspaceId).catch(() => null),
          ]);

          const financialData: Record<string, any> = {};
          if (healthReport) {
            financialData.financialSnapshot = healthReport.financials;
            financialData.manpowerCosts = {
              overtimeCost: healthReport.manpower.overtimeCost,
              utilizationRate: healthReport.manpower.utilizationRate,
              idleCapacity: healthReport.manpower.idleCapacity,
            };
            financialData.healthScore = healthReport.healthScore;
            financialData.strategies = healthReport.strategies?.filter(
              s => s.type === 'MARGIN_PROTECTION' || s.type === 'COST_ALERT' || s.type === 'YIELD_OPTIMIZER'
            );
          }
          if (strategicContext) {
            financialData.clientPortfolio = {
              enterpriseClients: strategicContext.summary.enterpriseClients,
              atRiskClients: strategicContext.summary.atRiskClients,
              totalClients: strategicContext.clients.length,
              clientTiers: strategicContext.clients.reduce((acc: Record<string, number>, c) => {
                acc[(c as any).tier] = (acc[(c as any).tier] || 0) + 1;
                return acc;
              }, {}),
            };
          }

          enrichedRequest.task = `[EXECUTIVE CFO DASHBOARD]\n\nFinancial Data:\n${JSON.stringify(financialData, null, 2)}\n\nOriginal Request: ${request.task}\n\nProvide a CFO-level financial dashboard that includes:\n1. Revenue metrics: this month vs last month, trend analysis\n2. Cost analysis: payroll, operations, labor percentage\n3. Margin health: gross and net margins with targets\n4. Cashflow status: net position, surplus, runway months\n5. Client portfolio analysis by tier (enterprise, premium, standard)\n6. Financial optimization recommendations\n7. At-risk accounts and mitigation strategies\n8. Growth projections and budget recommendations`;
          enrichedRequest.additionalContext = { ...existingContext, executiveEnrichment: 'cfo_dashboard', financialData };
          break;
        }

        case 'risk_assessment': {
          const [strategyScan, strategicContext, healthReport] = await Promise.all([
            growthStrategist.runWeeklyStrategyScan(workspaceId).catch(() => null),
            strategicOptimizationService.generateStrategicContext(workspaceId).catch(() => null),
            holisticGrowthEngine.analyzeBusinessHealth(workspaceId).catch(() => null),
          ]);

          const riskData: Record<string, any> = {};
          if (strategyScan) {
            riskData.empireScore = strategyScan.empireScore;
            riskData.cashOnTable = strategyScan.cashOnTable;
            riskData.opportunities = strategyScan.opportunities.map(o => ({
              type: o.type,
              priority: o.priority,
              title: o.title,
              impact: o.impact,
              estimatedROI: o.estimatedROI,
            }));
          }
          if (strategicContext) {
            riskData.operationalRisks = {
              problematicEmployees: strategicContext.summary.problematicEmployees,
              atRiskClients: strategicContext.summary.atRiskClients,
              employeesNeedingAttention: strategicContext.employees
                .filter(e => e.overallScore < 60)
                .map(e => ({ name: e.employeeName, score: e.overallScore, noShows: e.noShows })),
              clientsAtRisk: strategicContext.clients
                .filter(c => c.isAtRisk)
                .map(c => ({ name: c.clientName, tier: c.strategicTier, renewalProbability: c.renewalProbability })),
            };
          }
          if (healthReport) {
            riskData.financialRisks = {
              healthScore: healthReport.healthScore,
              healthStatus: healthReport.healthStatus,
              margins: healthReport.financials.margins,
              runwayMonths: healthReport.financials.cashflow.runwayMonths,
            };
          }

          enrichedRequest.task = `[RISK ASSESSMENT ANALYSIS]\n\nRisk Data:\n${JSON.stringify(riskData, null, 2)}\n\nOriginal Request: ${request.task}\n\nProvide a comprehensive risk assessment that includes:\n1. Risk matrix: categorize risks by likelihood and impact (critical/high/medium/low)\n2. Operational risks: employee reliability issues, staffing gaps\n3. Financial risks: margin erosion, cashflow concerns, at-risk revenue\n4. Client retention risks: at-risk accounts with churn probability\n5. Compliance gaps: licensing, certifications, regulatory concerns\n6. Strategic risks: market positioning, competitive threats\n7. Mitigation recommendations for each risk category\n8. Priority action items with timelines`;
          enrichedRequest.additionalContext = { ...existingContext, executiveEnrichment: 'risk_assessment', riskData };
          break;
        }

        case 'support_escalation': {
          const companyStats = await this.fetchDataByType('company_stats', request).catch(() => null);
          const financialMetrics = await this.fetchDataByType('financial_metrics', request).catch(() => null);

          const supportContext: Record<string, any> = {};
          if (companyStats) {
            supportContext.workspaceOverview = companyStats;
          }
          if (financialMetrics) {
            supportContext.accountStatus = {
              totalInvoiced: financialMetrics.totalInvoiced,
              totalPaid: financialMetrics.totalPaid,
              outstanding: financialMetrics.totalOutstanding,
            };
          }

          enrichedRequest.task = `[SUPPORT ESCALATION - HANDLE WITH EMPATHY]\n\nWorkspace Context:\n${JSON.stringify(supportContext, null, 2)}\n\nCustomer Issue: ${request.task}\n\nProvide empathetic, professional support escalation handling:\n1. Acknowledge the customer's concern with understanding\n2. Analyze the issue using available workspace and account context\n3. Provide clear resolution options (immediate fix, workaround, escalation path)\n4. Include relevant account details that inform the resolution\n5. Suggest preventive measures to avoid recurrence\n6. Provide escalation path if the issue requires higher-level intervention\n7. Close with reassurance and next steps`;
          enrichedRequest.additionalContext = { ...existingContext, executiveEnrichment: 'support_escalation', supportContext, preferredProvider: 'openai' };
          break;
        }

        case 'training_content': {
          enrichedRequest.task = `[TRAINING CONTENT GENERATION]\n\nOriginal Request: ${request.task}\n\nGenerate structured training content that includes:\n1. Learning Objectives: 3-5 clear, measurable objectives\n2. Prerequisites: What learners should know beforehand\n3. Content Sections: Break material into logical modules with:\n   - Section title and estimated duration\n   - Key concepts with explanations\n   - Practical examples and scenarios\n   - Best practices and common pitfalls\n4. Interactive Elements:\n   - 5 quiz questions (multiple choice) with correct answers and explanations\n   - 2 practical exercises or scenarios for hands-on practice\n5. Summary: Key takeaways and next steps for continued learning\n6. Additional Resources: Recommended reading or tools`;
          enrichedRequest.additionalContext = { ...existingContext, executiveEnrichment: 'training_content', preferredProvider: 'openai' };
          break;
        }
      }
    } catch (error: any) {
      log.error(`[UnifiedAIOrchestrator] Executive enrichment failed for ${taskType}, falling back to standard:`, (error instanceof Error ? error.message : String(error)));
    }

    return enrichedRequest;
  }

  getSessionContext(sessionId: string) {
    return this.sessionContexts.get(sessionId) || null;
  }

  clearSessionContext(sessionId: string) {
    this.sessionContexts.delete(sessionId);
  }

  getRoutingInfo(task: string, taskType?: TaskType): TaskRoutingDecision {
    const type = taskType || taskRouter.inferTaskType(task);
    return taskRouter.routeTask(type);
  }

}

export const unifiedAIOrchestrator = new UnifiedAIOrchestrator();
