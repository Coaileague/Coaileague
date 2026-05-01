/**
 * PLANNING FRAMEWORK SERVICE
 * ==========================
 * Structured reasoning frameworks for Trinity's autonomous planning.
 * Implements Chain-of-Thought (CoT) and ReAct patterns.
 * 
 * Capabilities:
 * - Chain-of-Thought: Decompose complex goals into logical steps
 * - ReAct Pattern: Reason-Act-Observe loop for dynamic planning
 * - Plan Validation: Verify plans before execution
 * - Dependency Analysis: Identify step dependencies
 * - Resource Estimation: Estimate time, cost, and credits
 * 
 * Fortune 500 Requirements:
 * - Structured, auditable reasoning chains
 * - Risk assessment for each plan step
 * - Alternative plan generation
 * - Rollback planning
 */

import { aiBrainService } from './aiBrainService';
import { trinityMemoryService } from './trinityMemoryService';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('planningFrameworkService');

// ============================================================================
// TYPES
// ============================================================================

export interface PlanningRequest {
  planId?: string;
  workspaceId: string;
  userId: string;
  
  // Goal definition
  goal: string;
  constraints?: string[];
  context?: string;
  
  // Planning parameters
  framework: 'chain_of_thought' | 'react' | 'tree_of_thought' | 'decomposition';
  maxSteps?: number;
  timeoutMs?: number;
  
  // Risk tolerance
  riskTolerance: 'low' | 'medium' | 'high';
  
  // Available resources
  availableActions?: string[];
  availableSubagents?: string[];
}

export interface ExecutionPlan {
  planId: string;
  goal: string;
  framework: PlanningRequest['framework'];
  
  // Steps
  steps: PlanStep[];
  dependencies: StepDependency[];
  
  // Reasoning
  reasoningChain: ReasoningNode[];
  
  // Estimates
  estimatedDurationMs: number;
  estimatedCredits: number;
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  
  // Risk
  riskAssessment: RiskAssessment;
  
  // Alternatives
  alternativePlans?: AlternativePlan[];
  rollbackPlan?: RollbackPlan;
  
  // Metadata
  createdAt: Date;
  validUntil: Date;
  confidence: number;
}

export interface PlanStep {
  stepId: string;
  order: number;
  action: string;
  description: string;
  
  // Execution details
  subagent?: string;
  parameters: Record<string, unknown>;
  
  // Dependencies
  dependsOn: string[];
  blockedBy?: string[];
  
  // Estimates
  estimatedDurationMs: number;
  estimatedCredits: number;
  
  // Risk
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  canFail: boolean;
  fallbackAction?: string;
  
  // Checkpoints
  isCheckpoint: boolean;
  requiresApproval: boolean;
  
  // Validation
  successCriteria: string[];
  validationMethod?: string;
}

export interface StepDependency {
  fromStep: string;
  toStep: string;
  type: 'sequential' | 'data' | 'resource' | 'approval';
  description: string;
}

export interface ReasoningNode {
  nodeId: string;
  type: 'thought' | 'action' | 'observation' | 'decision' | 'question';
  content: string;
  timestamp: Date;
  parentNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  mitigations: string[];
  worstCaseScenario: string;
  recoveryPlan: string;
}

export interface RiskFactor {
  factor: string;
  likelihood: 'unlikely' | 'possible' | 'likely' | 'certain';
  impact: 'minimal' | 'moderate' | 'significant' | 'severe';
  mitigation?: string;
}

export interface AlternativePlan {
  planId: string;
  description: string;
  tradeoffs: string[];
  estimatedCredits: number;
  confidence: number;
}

export interface RollbackPlan {
  triggers: string[];
  steps: PlanStep[];
  estimatedRecoveryTimeMs: number;
}

export interface ReactIteration {
  iterationNumber: number;
  thought: string;
  action: string;
  observation: string;
  shouldContinue: boolean;
}

// ============================================================================
// PLANNING FRAMEWORK SERVICE CLASS
// ============================================================================

class PlanningFrameworkService {
  private static instance: PlanningFrameworkService;
  private activePlans: Map<string, ExecutionPlan> = new Map();
  private planHistory: Map<string, ExecutionPlan[]> = new Map();

  private constructor() {
    log.info('[PlanningFramework] Initializing structured reasoning frameworks...');
  }

  static getInstance(): PlanningFrameworkService {
    if (!PlanningFrameworkService.instance) {
      PlanningFrameworkService.instance = new PlanningFrameworkService();
    }
    return PlanningFrameworkService.instance;
  }

  /**
   * Create an execution plan using specified framework
   */
  async createPlan(request: PlanningRequest): Promise<ExecutionPlan> {
    const planId = request.planId || `plan-${crypto.randomUUID()}`;
    const startTime = Date.now();

    log.info(`[PlanningFramework] Creating ${request.framework} plan for: ${request.goal}`);

    let plan: ExecutionPlan;

    switch (request.framework) {
      case 'chain_of_thought':
        plan = await this.chainOfThoughtPlanning(planId, request);
        break;
      case 'react':
        plan = await this.reactPlanning(planId, request);
        break;
      case 'tree_of_thought':
        plan = await this.treeOfThoughtPlanning(planId, request);
        break;
      case 'decomposition':
        plan = await this.decompositionPlanning(planId, request);
        break;
      default:
        plan = await this.chainOfThoughtPlanning(planId, request);
    }

    // Store plan
    this.activePlans.set(planId, plan);

    // Log to audit
    await this.logPlan(request, plan);

    // Publish event
    platformEventBus.publish('ai_brain_action', {
      action: 'plan_created',
      planId,
      framework: request.framework,
      stepCount: plan.steps.length,
      estimatedCredits: plan.estimatedCredits,
      complexity: plan.complexity,
    });

    log.info(`[PlanningFramework] Plan created in ${Date.now() - startTime}ms: ${plan.steps.length} steps`);

    return plan;
  }

  /**
   * Chain-of-Thought planning
   */
  private async chainOfThoughtPlanning(
    planId: string,
    request: PlanningRequest
  ): Promise<ExecutionPlan> {
    const prompt = `You are Trinity's Planning Engine. Create a detailed execution plan using Chain-of-Thought reasoning.

GOAL: ${request.goal}

${request.context ? `CONTEXT: ${request.context}` : ''}
${request.constraints?.length ? `CONSTRAINTS:\n${request.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

RISK TOLERANCE: ${request.riskTolerance}
MAX STEPS: ${request.maxSteps || 10}

${request.availableSubagents?.length ? `AVAILABLE SUBAGENTS:\n${request.availableSubagents.join(', ')}` : ''}

Think through this step by step:
1. What is the core objective?
2. What are the key requirements?
3. What are the potential risks?
4. What is the optimal sequence of steps?
5. What validation is needed?

Provide your plan as JSON:
{
  "reasoningSteps": ["Step 1: ...", "Step 2: ...", ...],
  "steps": [
    {
      "order": 1,
      "action": "action_name",
      "description": "What this step does",
      "subagent": "optional_subagent_name",
      "parameters": {},
      "dependsOn": [],
      "estimatedDurationMs": 5000,
      "estimatedCredits": 5,
      "riskLevel": "low|medium|high|critical",
      "canFail": false,
      "isCheckpoint": false,
      "requiresApproval": false,
      "successCriteria": ["criteria1", "criteria2"]
    }
  ],
  "riskFactors": [
    {
      "factor": "description",
      "likelihood": "unlikely|possible|likely",
      "impact": "minimal|moderate|significant",
      "mitigation": "how to mitigate"
    }
  ],
  "alternativeApproach": "Brief description of alternative approach",
  "estimatedTotalCredits": 25,
  "complexity": "simple|moderate|complex|expert",
  "confidence": 0.85
}`;

    const response = await (aiBrainService as any).query({
      prompt,
      systemPrompt: 'You are an expert planning system. Create comprehensive, actionable plans with clear reasoning.',
      featureId: 'planning_framework',
      workspaceId: request.workspaceId,
      userId: request.userId,
      responseFormat: 'json',
    });

    let parsed: any;
    try {
      parsed = JSON.parse(response.response || '{}');
    } catch {
      parsed = {};
    }
    
    return this.buildPlanFromResponse(planId, request, parsed, 'chain_of_thought');
  }

  /**
   * ReAct (Reason-Act-Observe) planning
   */
  private async reactPlanning(
    planId: string,
    request: PlanningRequest
  ): Promise<ExecutionPlan> {
    const iterations: ReactIteration[] = [];
    const maxIterations = request.maxSteps || 5;
    let continueLoop = true;
    let context = request.context || '';

    // ReAct loop
    for (let i = 0; i < maxIterations && continueLoop; i++) {
      const iteration = await this.runReactIteration(
        request,
        i + 1,
        context,
        iterations
      );
      
      iterations.push(iteration);
      context += `\nIteration ${i + 1}: ${iteration.observation}`;
      continueLoop = iteration.shouldContinue;
    }

    // Convert iterations to plan
    return this.convertReactToPlan(planId, request, iterations);
  }

  /**
   * Run single ReAct iteration
   */
  private async runReactIteration(
    request: PlanningRequest,
    iterationNumber: number,
    context: string,
    previousIterations: ReactIteration[]
  ): Promise<ReactIteration> {
    const prompt = `You are using ReAct (Reason-Act-Observe) to solve a problem.

GOAL: ${request.goal}
CURRENT CONTEXT: ${context}

${previousIterations.length > 0 ? `PREVIOUS ITERATIONS:\n${previousIterations.map((it, i) => 
  `Iteration ${i + 1}:\n  Thought: ${it.thought}\n  Action: ${it.action}\n  Observation: ${it.observation}`
).join('\n\n')}` : ''}

For iteration ${iterationNumber}, provide:
1. THOUGHT: Your reasoning about what to do next
2. ACTION: The specific action to take
3. OBSERVATION: What you expect to observe (or what you learned)
4. SHOULD_CONTINUE: Whether more iterations are needed

Respond as JSON:
{
  "thought": "Your reasoning...",
  "action": "The action to take",
  "observation": "Expected result or observation",
  "shouldContinue": true/false
}`;

    const response = await (aiBrainService as any).query({
      prompt,
      systemPrompt: 'You are an intelligent agent using ReAct reasoning. Think step by step.',
      featureId: 'planning_framework',
      workspaceId: request.workspaceId,
      userId: request.userId,
      responseFormat: 'json',
    });

    let parsed: any; try { parsed = JSON.parse(response.response || '{}'); } catch { parsed = {}; }
    
    return {
      iterationNumber,
      thought: parsed.thought || '',
      action: parsed.action || '',
      observation: parsed.observation || '',
      shouldContinue: parsed.shouldContinue ?? false,
    };
  }

  /**
   * Convert ReAct iterations to execution plan
   */
  private convertReactToPlan(
    planId: string,
    request: PlanningRequest,
    iterations: ReactIteration[]
  ): ExecutionPlan {
    const steps: PlanStep[] = iterations
      .filter(it => it.action)
      .map((it, i) => ({
        stepId: `step-${i + 1}`,
        order: i + 1,
        action: it.action,
        description: it.thought,
        parameters: {},
        dependsOn: i > 0 ? [`step-${i}`] : [],
        estimatedDurationMs: 5000,
        estimatedCredits: 5,
        riskLevel: 'medium' as const,
        canFail: false,
        isCheckpoint: i === iterations.length - 1,
        requiresApproval: false,
        successCriteria: [it.observation],
      }));

    const reasoningChain: ReasoningNode[] = iterations.flatMap((it, i) => [
      {
        nodeId: `thought-${i}`,
        type: 'thought' as const,
        content: it.thought,
        timestamp: new Date(),
      },
      {
        nodeId: `action-${i}`,
        type: 'action' as const,
        content: it.action,
        timestamp: new Date(),
        parentNodeId: `thought-${i}`,
      },
      {
        nodeId: `observation-${i}`,
        type: 'observation' as const,
        content: it.observation,
        timestamp: new Date(),
        parentNodeId: `action-${i}`,
      },
    ]);

    return {
      planId,
      goal: request.goal,
      framework: 'react',
      steps,
      dependencies: this.buildDependencies(steps),
      reasoningChain,
      estimatedDurationMs: steps.length * 5000,
      estimatedCredits: steps.length * 5,
      complexity: steps.length <= 3 ? 'simple' : steps.length <= 6 ? 'moderate' : 'complex',
      riskAssessment: this.buildDefaultRiskAssessment(request.riskTolerance),
      createdAt: new Date(),
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: 0.75,
    };
  }

  /**
   * Tree-of-Thought planning (explores multiple paths)
   */
  private async treeOfThoughtPlanning(
    planId: string,
    request: PlanningRequest
  ): Promise<ExecutionPlan> {
    // Generate multiple approaches
    const prompt = `You are Trinity's Planning Engine using Tree-of-Thought reasoning.
Generate 3 different approaches to solve this goal, then evaluate and combine the best elements.

GOAL: ${request.goal}
${request.context ? `CONTEXT: ${request.context}` : ''}

For each approach:
1. Describe the strategy
2. List the steps
3. Assess pros and cons
4. Rate confidence (0-1)

Then synthesize the optimal plan combining the best elements.

Respond as JSON:
{
  "approaches": [
    {
      "strategy": "Description",
      "steps": ["step1", "step2"],
      "pros": ["pro1"],
      "cons": ["con1"],
      "confidence": 0.8
    }
  ],
  "synthesis": {
    "bestElements": ["element1", "element2"],
    "finalSteps": [
      {
        "order": 1,
        "action": "action",
        "description": "description",
        "riskLevel": "low"
      }
    ],
    "confidence": 0.9
  }
}`;

    const response = await (aiBrainService as any).query({
      prompt,
      systemPrompt: 'You are an expert multi-path planning system. Explore alternatives thoroughly.',
      featureId: 'planning_framework',
      workspaceId: request.workspaceId,
      userId: request.userId,
      responseFormat: 'json',
    });

    let parsed: any; try { parsed = JSON.parse(response.response || '{}'); } catch { parsed = {}; }
    
    return this.buildPlanFromResponse(planId, request, {
      steps: parsed.synthesis?.finalSteps || [],
      confidence: parsed.synthesis?.confidence || 0.7,
      reasoningSteps: parsed.approaches?.map((a: any) => `Approach: ${a.strategy}`) || [],
    }, 'tree_of_thought');
  }

  /**
   * Decomposition planning (break into subgoals)
   */
  private async decompositionPlanning(
    planId: string,
    request: PlanningRequest
  ): Promise<ExecutionPlan> {
    const prompt = `You are Trinity's Planning Engine. Decompose this complex goal into manageable subgoals.

GOAL: ${request.goal}
${request.context ? `CONTEXT: ${request.context}` : ''}

1. Identify the main subgoals (2-5)
2. For each subgoal, list specific actions
3. Identify dependencies between subgoals
4. Assign to appropriate subagents if available

${request.availableSubagents?.length ? `AVAILABLE SUBAGENTS: ${request.availableSubagents.join(', ')}` : ''}

Respond as JSON:
{
  "subgoals": [
    {
      "name": "Subgoal 1",
      "description": "What this subgoal achieves",
      "steps": [
        {
          "order": 1,
          "action": "action_name",
          "description": "description",
          "subagent": "optional_subagent"
        }
      ],
      "dependsOn": []
    }
  ],
  "executionOrder": ["subgoal1", "subgoal2"],
  "parallelizable": ["subgoal1", "subgoal2"],
  "confidence": 0.85
}`;

    const response = await (aiBrainService as any).query({
      prompt,
      systemPrompt: 'You are an expert at breaking complex goals into manageable subgoals.',
      featureId: 'planning_framework',
      workspaceId: request.workspaceId,
      userId: request.userId,
      responseFormat: 'json',
    });

    let parsed: any; try { parsed = JSON.parse(response.response || '{}'); } catch { parsed = {}; }
    
    // Flatten subgoals into steps
    const steps: any[] = [];
    let order = 1;
    
    for (const subgoal of (parsed.subgoals || [])) {
      for (const step of (subgoal.steps || [])) {
        steps.push({
          ...step,
          order: order++,
          subgoalName: subgoal.name,
        });
      }
    }

    return this.buildPlanFromResponse(planId, request, {
      steps,
      confidence: parsed.confidence || 0.8,
      reasoningSteps: (parsed.subgoals || []).map((sg: any) => `Subgoal: ${sg.name} - ${sg.description}`),
    }, 'decomposition');
  }

  /**
   * Build ExecutionPlan from AI response
   */
  private buildPlanFromResponse(
    planId: string,
    request: PlanningRequest,
    parsed: any,
    framework: PlanningRequest['framework']
  ): ExecutionPlan {
    const steps: PlanStep[] = (parsed.steps || []).map((s: any, i: number) => ({
      stepId: `step-${i + 1}`,
      order: s.order || i + 1,
      action: s.action || 'unknown',
      description: s.description || '',
      subagent: s.subagent,
      parameters: s.parameters || {},
      dependsOn: s.dependsOn || (i > 0 ? [`step-${i}`] : []),
      estimatedDurationMs: s.estimatedDurationMs || 5000,
      estimatedCredits: s.estimatedCredits || 5,
      riskLevel: s.riskLevel || 'medium',
      canFail: s.canFail ?? false,
      fallbackAction: s.fallbackAction,
      isCheckpoint: s.isCheckpoint ?? false,
      requiresApproval: s.requiresApproval ?? false,
      successCriteria: s.successCriteria || ['Step completed'],
    }));

    const reasoningChain: ReasoningNode[] = (parsed.reasoningSteps || []).map((r: string, i: number) => ({
      nodeId: `reason-${i}`,
      type: 'thought' as const,
      content: r,
      timestamp: new Date(),
    }));

    const estimatedCredits = steps.reduce((sum, s) => sum + s.estimatedCredits, 0);
    const estimatedDuration = steps.reduce((sum, s) => sum + s.estimatedDurationMs, 0);

    return {
      planId,
      goal: request.goal,
      framework,
      steps,
      dependencies: this.buildDependencies(steps),
      reasoningChain,
      estimatedDurationMs: estimatedDuration,
      estimatedCredits,
      complexity: parsed.complexity || this.assessComplexity(steps),
      riskAssessment: this.buildRiskAssessment(parsed.riskFactors || [], request.riskTolerance),
      createdAt: new Date(),
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: parsed.confidence || 0.75,
    };
  }

  /**
   * Build step dependencies
   */
  private buildDependencies(steps: PlanStep[]): StepDependency[] {
    const dependencies: StepDependency[] = [];
    
    for (const step of steps) {
      for (const depId of step.dependsOn) {
        dependencies.push({
          fromStep: depId,
          toStep: step.stepId,
          type: 'sequential',
          description: `${step.stepId} depends on ${depId}`,
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Assess plan complexity
   */
  private assessComplexity(steps: PlanStep[]): ExecutionPlan['complexity'] {
    const stepCount = steps.length;
    const highRiskSteps = steps.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length;
    const approvalSteps = steps.filter(s => s.requiresApproval).length;
    
    const complexityScore = stepCount + (highRiskSteps * 2) + (approvalSteps * 1.5);
    
    if (complexityScore <= 3) return 'simple';
    if (complexityScore <= 7) return 'moderate';
    if (complexityScore <= 12) return 'complex';
    return 'expert';
  }

  /**
   * Build risk assessment
   */
  private buildRiskAssessment(
    riskFactors: RiskFactor[],
    tolerance: PlanningRequest['riskTolerance']
  ): RiskAssessment {
    const factors = riskFactors.length > 0 ? riskFactors : [{
      factor: 'Unknown risks',
      likelihood: 'possible' as const,
      impact: 'moderate' as const,
    }];

    const severityScore = factors.reduce((score, f) => {
      const likelihoodWeight = { unlikely: 1, possible: 2, likely: 3, certain: 4 };
      const impactWeight = { minimal: 1, moderate: 2, significant: 3, severe: 4 };
      return score + (likelihoodWeight[f.likelihood] * impactWeight[f.impact]);
    }, 0);

    const avgSeverity = severityScore / factors.length;
    
    let overallRisk: RiskAssessment['overallRisk'];
    if (avgSeverity <= 2) overallRisk = 'low';
    else if (avgSeverity <= 4) overallRisk = 'medium';
    else if (avgSeverity <= 8) overallRisk = 'high';
    else overallRisk = 'critical';

    return {
      overallRisk,
      riskFactors: factors,
      mitigations: factors.filter(f => f.mitigation).map(f => f.mitigation!),
      worstCaseScenario: 'Plan execution fails and requires manual intervention',
      recoveryPlan: 'Rollback to previous state and escalate to human operator',
    };
  }

  /**
   * Build default risk assessment
   */
  private buildDefaultRiskAssessment(tolerance: PlanningRequest['riskTolerance']): RiskAssessment {
    return {
      overallRisk: tolerance === 'low' ? 'low' : tolerance === 'high' ? 'medium' : 'low',
      riskFactors: [],
      mitigations: [],
      worstCaseScenario: 'Plan may fail',
      recoveryPlan: 'Rollback and retry',
    };
  }

  /**
   * Log plan to audit system
   */
  private async logPlan(request: PlanningRequest, plan: ExecutionPlan): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        entityType: 'plan',
        entityId: plan.planId,
        userId: request.userId,
        workspaceId: request.workspaceId,
        action: 'create_plan',
        metadata: { eventType: 'planning_framework', severity: plan.riskAssessment.overallRisk === 'critical' ? 'high' : 'medium', details: JSON.stringify({ framework: plan.framework, stepCount: plan.steps.length, estimatedCredits: plan.estimatedCredits, complexity: plan.complexity, overallRisk: plan.riskAssessment.overallRisk, confidence: plan.confidence }) },
      });
    } catch (error) {
      log.error('[PlanningFramework] Failed to log plan:', error);
    }
  }

  /**
   * Validate a plan before execution
   */
  async validatePlan(planId: string): Promise<{
    valid: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      return { valid: false, issues: ['Plan not found'], warnings: [] };
    }

    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for empty steps
    if (plan.steps.length === 0) {
      issues.push('Plan has no steps');
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const checkCircular = (stepId: string, path: Set<string>): boolean => {
      if (path.has(stepId)) return true;
      path.add(stepId);
      const step = plan.steps.find(s => s.stepId === stepId);
      if (step) {
        for (const dep of step.dependsOn) {
          if (checkCircular(dep, new Set(path))) return true;
        }
      }
      return false;
    };
    
    for (const step of plan.steps) {
      if (checkCircular(step.stepId, new Set())) {
        issues.push(`Circular dependency detected at step ${step.stepId}`);
      }
    }

    // Check for expired plan
    if (plan.validUntil < new Date()) {
      warnings.push('Plan has expired and should be regenerated');
    }

    // Check for high-risk steps without approval
    const highRiskWithoutApproval = plan.steps.filter(
      s => (s.riskLevel === 'high' || s.riskLevel === 'critical') && !s.requiresApproval
    );
    if (highRiskWithoutApproval.length > 0) {
      warnings.push(`${highRiskWithoutApproval.length} high-risk steps lack approval gates`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Get active plan
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Cancel a plan
   */
  cancelPlan(planId: string): boolean {
    return this.activePlans.delete(planId);
  }
}

export const planningFrameworkService = PlanningFrameworkService.getInstance();
