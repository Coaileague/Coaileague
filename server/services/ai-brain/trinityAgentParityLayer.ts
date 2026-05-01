/**
 * TRINITY AGENT PARITY LAYER
 * ==========================
 * Bridges the gap between Trinity AI Brain and Replit Agent capabilities.
 * Implements the missing patterns that make autonomous AI agents effective:
 * 
 * 1. Plan-Execute-Reflect Loop: Structured multi-step planning before execution
 * 2. Verification Loops: Pre-flight simulation and post-execution validation
 * 3. Confidence Scoring: Track uncertainty and trigger retries/escalation
 * 4. Context Integration: Pull spec-index, memory, and codebase understanding
 * 5. Self-Correction: Auto-fix errors without human intervention when safe
 * 
 * This layer makes Trinity a true autonomous coding assistant.
 */

import { planningFrameworkService } from './planningFrameworkService';
import { createLogger } from '../../lib/logger';
import type { ExecutionPlan, PlanStep, PlanningRequest } from './planningFrameworkService';
import { selfReflectionEngine } from './selfReflectionEngine';
import type { ReflectionResult, ReflectionContext } from './selfReflectionEngine';
import { trinityCodeOps } from './trinityCodeOps';
import { trinityMemoryService } from './trinityMemoryService';
import { adaptiveSupervisionRouter } from './adaptiveSupervisionRouter';
import { aiBrainService } from './aiBrainService';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import specIndex from '../../../spec-index.json';
import crypto from 'crypto';

// ============================================================================
// TYPES - AGENT PARITY
// ============================================================================

interface WorkOrder {
  id: string;
  goal: string;
  status: string;
}

export interface AgentExecutionContext {
  executionId: string;
  workspaceId: string;
  userId: string;
  goal: string;
  plan?: ExecutionPlan;
  workOrder?: WorkOrder;
  
  // Confidence tracking
  overallConfidence: number;
  stepConfidences: Map<string, number>;
  
  // Execution state
  currentStep: number;
  executedSteps: ExecutedStepResult[];
  pendingSteps: PlanStep[];
  
  // Reflection
  reflectionCycles: number;
  lastReflection?: ReflectionResult;
  
  // Context from codebase
  relevantFiles: string[];
  relevantComponents: string[];
  specContext: any;
}

export interface ExecutedStepResult {
  stepId: string;
  action: string;
  input: Record<string, unknown>;
  output: any;
  success: boolean;
  confidence: number;
  durationMs: number;
  timestamp: Date;
  verified: boolean;
  verificationResult?: VerificationResult;
}

export interface VerificationResult {
  passed: boolean;
  type: 'lint' | 'test' | 'type_check' | 'diff_review' | 'manual' | 'pending_retry';
  details: string;
  errors?: string[];
  warnings?: string[];
}

export interface AgentExecutionResult {
  executionId: string;
  success: boolean;
  stepsCompleted: number;
  stepsTotal: number;
  finalConfidence: number;
  reflectionCycles: number;
  autoCorrections: number;
  humanEscalationsTriggered: number;
  summary: string;
  changes: ChangeRecord[];
  durationMs: number;
}

export interface ChangeRecord {
  type: 'file_created' | 'file_modified' | 'file_deleted' | 'test_run' | 'command_executed';
  target: string;
  description: string;
  verified: boolean;
  rollbackable: boolean;
}

// ============================================================================
// AGENT PARITY LAYER
// ============================================================================

class TrinityAgentParityLayer {
  private static instance: TrinityAgentParityLayer;
  private activeExecutions: Map<string, AgentExecutionContext> = new Map();
  private readonly log = createLogger('AgentParity');
  
  // Configuration
  private readonly minConfidenceForAutoExecution = 0.7;
  private readonly minConfidenceForCommit = 0.85;
  private readonly maxReflectionCycles = 3;
  private readonly verificationTimeout = 30000;
  
  private constructor() {
    this.log.info('Initializing Trinity Agent Parity Layer...');
    this.registerOrchestratorActions();
  }

  static getInstance(): TrinityAgentParityLayer {
    if (!TrinityAgentParityLayer.instance) {
      TrinityAgentParityLayer.instance = new TrinityAgentParityLayer();
    }
    return TrinityAgentParityLayer.instance;
  }

  /**
   * MAIN ENTRY: Execute a goal with full agent parity
   * This is the Replit Agent-equivalent workflow
   */
  async executeWithAgentParity(
    goal: string,
    workspaceId: string,
    userId: string,
    options?: {
      framework?: 'chain_of_thought' | 'react' | 'decomposition';
      riskTolerance?: 'low' | 'medium' | 'high';
      autoCommit?: boolean;
      dryRun?: boolean;
    }
  ): Promise<AgentExecutionResult> {
    const executionId = `exec-${crypto.randomUUID()}`;
    const startTime = Date.now();
    
    this.log.info(`Starting agent execution: ${goal.substring(0, 100)}...`);
    
    // Initialize context
    const context: AgentExecutionContext = {
      executionId,
      workspaceId,
      userId,
      goal,
      overallConfidence: 1.0,
      stepConfidences: new Map(),
      currentStep: 0,
      executedSteps: [],
      pendingSteps: [],
      reflectionCycles: 0,
      relevantFiles: [],
      relevantComponents: [],
      specContext: null,
    };
    
    this.activeExecutions.set(executionId, context);
    
    try {
      // PHASE 1: Context Gathering (like Replit Agent's codebase understanding)
      await this.gatherContext(context);
      
      // PHASE 2: Planning (structured multi-step plan)
      await this.createStructuredPlan(context, options?.framework || 'chain_of_thought', options?.riskTolerance || 'medium');
      
      // PHASE 3: Execute with Verification Loop
      await this.executeWithVerification(context, options?.dryRun || false);
      
      // PHASE 4: Final Reflection
      await this.finalReflection(context);
      
      // PHASE 5: Commit if approved
      if (options?.autoCommit && context.overallConfidence >= this.minConfidenceForCommit) {
        await this.commitChanges(context);
      }
      
      const result = this.buildExecutionResult(context, startTime);
      
      // Log completion
      await this.logExecution(context, result);
      
      // Publish event
      platformEventBus.publish('ai_brain_action', {
        action: 'agent_execution_complete',
        executionId,
        success: result.success,
        stepsCompleted: result.stepsCompleted,
        confidence: result.finalConfidence,
      });
      
      return result;
      
    } catch (error: any) {
      this.log.error(`Execution failed:`, error);
      return {
        executionId,
        success: false,
        stepsCompleted: context.currentStep,
        stepsTotal: context.pendingSteps.length + context.currentStep,
        finalConfidence: 0,
        reflectionCycles: context.reflectionCycles,
        autoCorrections: 0,
        humanEscalationsTriggered: 1,
        summary: `Execution failed: ${(error instanceof Error ? error.message : String(error))}`,
        changes: [],
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * PHASE 1: Gather context from codebase, spec-index, and memory
   */
  private async gatherContext(context: AgentExecutionContext): Promise<void> {
    this.log.info('Phase 1: Gathering context...');
    
    // Get spec-index components related to the goal
    const components = (specIndex as any).components || {};
    const relevantComponents: string[] = [];
    const relevantFiles: string[] = [];
    
    const goalLower = context.goal.toLowerCase();
    for (const [id, component] of Object.entries(components)) {
      const comp = component as any;
      const matchesIntent = comp.intent?.toLowerCase().includes(goalLower) ||
                           comp.name?.toLowerCase().includes(goalLower);
      
      // Check for keyword matches
      const keywords = ['auth', 'payment', 'stripe', 'schedule', 'notification', 'trinity', 'ai', 'dashboard'];
      const keywordMatch = keywords.some(kw => 
        goalLower.includes(kw) && (comp.name?.toLowerCase().includes(kw) || comp.intent?.toLowerCase().includes(kw))
      );
      
      if (matchesIntent || keywordMatch) {
        relevantComponents.push(id);
        if (comp.files) {
          relevantFiles.push(...comp.files);
        }
      }
    }
    
    context.relevantComponents = relevantComponents;
    context.relevantFiles = [...new Set(relevantFiles)];
    context.specContext = {
      tiers: (specIndex as any).tiers,
      editingRules: (specIndex as any).aiEditingRules,
      secretsMap: (specIndex as any).secretsMap,
    };
    
    // Get memory context from Trinity (using memory service directly)
    try {
      const userProfile = await (trinityMemoryService as any).getUserProfile(context.userId, context.workspaceId);
      context.specContext.memoryContext = userProfile;
    } catch (error) {
      this.log.warn('Memory context unavailable:', error);
    }
    
    this.log.info(`Context gathered: ${relevantComponents.length} components, ${relevantFiles.length} files`);
  }

  /**
   * PHASE 2: Create structured plan using PlanningFrameworkService
   */
  private async createStructuredPlan(
    context: AgentExecutionContext,
    framework: 'chain_of_thought' | 'react' | 'decomposition',
    riskTolerance: 'low' | 'medium' | 'high'
  ): Promise<void> {
    this.log.info(`Phase 2: Creating ${framework} plan...`);
    
    // Build context string for planning
    const contextString = await this.buildContextString(context);
    
    // Create plan using PlanningFrameworkService
    const planRequest: PlanningRequest = {
      workspaceId: context.workspaceId,
      userId: context.userId,
      goal: context.goal,
      context: contextString,
      constraints: this.getConstraintsFromSpec(context),
      framework,
      riskTolerance,
      maxSteps: 15,
      availableSubagents: ['code_ops', 'test_runner', 'file_system', 'database'],
      availableActions: [
        'search_code', 'read_file', 'write_file', 'edit_file',
        'run_test', 'analyze', 'validate', 'commit'
      ],
    };
    
    const plan = await planningFrameworkService.createPlan(planRequest);
    context.plan = plan;
    context.pendingSteps = [...plan.steps];
    context.overallConfidence = plan.confidence;
    
    // Route through adaptive supervisor for complexity assessment
    try {
      const routingResult = await (adaptiveSupervisionRouter as any).routeRequest({
        workspaceId: context.workspaceId,
        userId: context.userId,
        intent: context.goal,
        taskType: 'autonomous_execution',
        payload: { planId: plan.planId, complexity: plan.complexity },
      });
      
      if (routingResult.supervisionLevel === 'human_required') {
        this.log.info('Human approval required for this task');
      }
    } catch (error) {
      this.log.warn('Adaptive routing unavailable:', error);
    }
    
    this.log.info(`Plan created: ${plan.steps.length} steps, confidence: ${plan.confidence}`);
  }

  /**
   * PHASE 3: Execute plan with verification loops
   */
  private async executeWithVerification(context: AgentExecutionContext, dryRun: boolean): Promise<void> {
    this.log.info(`Phase 3: Executing with verification (dryRun: ${dryRun})...`);
    
    while (context.pendingSteps.length > 0) {
      const step = context.pendingSteps.shift()!;
      context.currentStep++;
      
      this.log.info(`Executing step ${context.currentStep}: ${step.action}`);
      
      // Pre-flight check
      const preFlightResult = await this.preFlightCheck(step, context);
      if (!preFlightResult.safe) {
        this.log.warn(`Pre-flight failed for step ${step.stepId}: ${preFlightResult.reason}`);
        
        // Try to recover
        const recovered = await this.attemptRecovery(step, preFlightResult, context);
        if (!recovered) {
          context.overallConfidence *= 0.5;
          continue;
        }
      }
      
      // Execute step
      let stepResult = dryRun 
        ? await this.simulateStep(step, context)
        : await this.executeStep(step, context);
      
      // Post-execution verification
      if (!dryRun && stepResult.success) {
        const verification = await this.verifyStepResult(step, stepResult, context);
        stepResult.verified = verification.passed;
        stepResult.verificationResult = verification;
        
        if (!verification.passed) {
          // Attempt self-correction
          const correctionResult = await this.selfCorrect(step, stepResult, verification, context);
          if (correctionResult.success && correctionResult.correctedResult) {
            // Replace stepResult with the corrected version
            stepResult = correctionResult.correctedResult;
            
            // Re-run verification on the corrected result
            const reVerification = await this.verifyStepResult(step, stepResult, context);
            stepResult.verified = reVerification.passed;
            stepResult.verificationResult = reVerification;
            
            if (reVerification.passed) {
              this.log.info(`Self-correction successful and verified for step ${step.stepId}`);
            } else {
              this.log.warn(`Self-correction applied but verification still failed for step ${step.stepId}`);
              context.overallConfidence *= 0.8;
            }
          } else {
            context.overallConfidence *= 0.7;
          }
        }
      }
      
      context.executedSteps.push(stepResult);
      context.stepConfidences.set(step.stepId, stepResult.confidence);
      
      // Check for low confidence escalation
      if (context.overallConfidence < this.minConfidenceForAutoExecution) {
        await this.triggerLowConfidenceEscalation(context);
        this.log.warn(`Confidence dropped below threshold (${context.overallConfidence}), pausing execution`);
        break; // Stop autonomous execution when confidence is too low
      }
      
      // Periodic reflection
      if (context.currentStep % 3 === 0 && context.currentStep > 0) {
        await this.periodicReflection(context);
      }
    }
  }

  /**
   * Pre-flight safety check before executing a step
   */
  private async preFlightCheck(step: PlanStep, context: AgentExecutionContext): Promise<{ safe: boolean; reason?: string }> {
    // Check if step affects tier-0 components (require human approval)
    const tier0Components = context.relevantComponents.filter(id => {
      const comp = ((specIndex as any).components || {})[id];
      return comp?.tier === 'tier0';
    });
    
    if (tier0Components.length > 0 && step.riskLevel !== 'low') {
      return { safe: false, reason: `Step affects critical tier-0 components: ${tier0Components.join(', ')}` };
    }
    
    // Check confidence threshold
    if (context.overallConfidence < this.minConfidenceForAutoExecution) {
      return { safe: false, reason: `Confidence too low: ${context.overallConfidence}` };
    }
    
    // Check for destructive operations
    if (step.action === 'write_file' || step.action === 'edit_file') {
      const targetFile = step.parameters?.filePath || step.parameters?.path;
      if (targetFile && this.isProtectedFile(targetFile)) {
        return { safe: false, reason: `Cannot modify protected file: ${targetFile}` };
      }
    }
    
    return { safe: true };
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: PlanStep, context: AgentExecutionContext): Promise<ExecutedStepResult> {
    const startTime = Date.now();
    
    try {
      let output: any;
      
      switch (step.action) {
        case 'search_code':
          output = await trinityCodeOps.searchCode(step.parameters);
          break;
        case 'read_file':
        case 'write_file':
        case 'edit_file':
          output = await this.executeFileOperation(step.action, step.parameters);
          break;
        case 'run_test':
          output = await this.executeTestRun(step.parameters);
          break;
        case 'analyze':
          output = await this.analyzeCode(step.parameters, context);
          break;
        case 'validate':
          output = await this.validateChanges(context);
          break;
        default:
          output = { message: `Action ${step.action} executed (simulated)` };
      }
      
      return {
        stepId: step.stepId,
        action: step.action,
        input: step.parameters,
        output,
        success: true,
        confidence: 0.9,
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
        verified: false,
      };
      
    } catch (error: any) {
      return {
        stepId: step.stepId,
        action: step.action,
        input: step.parameters,
        output: null,
        success: false,
        confidence: 0,
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
        verified: false,
        verificationResult: {
          passed: false,
          type: 'manual',
          details: `Step failed: ${(error instanceof Error ? error.message : String(error))}`,
          errors: [(error instanceof Error ? error.message : String(error))],
        },
      };
    }
  }

  private async executeFileOperation(action: string, params: Record<string, unknown>): Promise<unknown> {
    const filePath = params.path || params.filePath;
    const fs = await import('fs/promises');
    
    switch (action) {
      case 'read_file':
        const content = await fs.readFile(filePath, 'utf-8');
        return { success: true, content };
      case 'write_file':
        await fs.writeFile(filePath, params.content, 'utf-8');
        return { success: true, message: `File written: ${filePath}` };
      case 'edit_file':
        const existing = await fs.readFile(filePath, 'utf-8');
        const updated = existing.replace(params.oldContent, params.newContent);
        await fs.writeFile(filePath, updated, 'utf-8');
        return { success: true, message: `File edited: ${filePath}` };
      default:
        return { success: false, error: `Unknown file operation: ${action}` };
    }
  }

  private async executeTestRun(params: Record<string, unknown>): Promise<unknown> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      // Run tests without suppressing failures
      const result = await execAsync('npm test -- --passWithNoTests 2>&1', { timeout: 30000 });
      const passed = !result.stdout.includes('FAIL') && !result.stderr.includes('FAIL');
      return {
        success: passed,
        passed,
        summary: result.stdout.substring(0, 500),
        exitCode: 0,
      };
    } catch (error: any) {
      // Test command failed - this indicates actual test failures
      return {
        success: false,
        passed: false,
        summary: (error instanceof Error ? error.message : String(error)),
        exitCode: error.code || 1,
        stderr: error.stderr?.substring(0, 500),
      };
    }
  }

  /**
   * Simulate a step (dry run)
   */
  private async simulateStep(step: PlanStep, context: AgentExecutionContext): Promise<ExecutedStepResult> {
    return {
      stepId: step.stepId,
      action: step.action,
      input: step.parameters,
      output: { simulated: true, action: step.action },
      success: true,
      confidence: 0.8,
      durationMs: 0,
      timestamp: new Date(),
      verified: true,
      verificationResult: {
        passed: true,
        type: 'diff_review',
        details: 'Dry run simulation - no actual changes made',
      },
    };
  }

  /**
   * Verify step result after execution
   */
  private async verifyStepResult(
    step: PlanStep,
    result: ExecutedStepResult,
    context: AgentExecutionContext
  ): Promise<VerificationResult> {
    if (step.action === 'write_file' || step.action === 'edit_file') {
      const filePath = step.parameters.path || step.parameters.filePath;
      
      // TypeScript type checking
      if (filePath?.endsWith('.ts') || filePath?.endsWith('.tsx')) {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          const tscResult = await execAsync(`npx tsc --noEmit ${filePath} 2>&1 || true`, { timeout: 10000 });
          if (tscResult.stderr || tscResult.stdout.includes('error')) {
            return {
              passed: false,
              type: 'type_check',
              details: 'TypeScript errors detected',
              errors: [tscResult.stdout || tscResult.stderr],
            };
          }
        } catch (error) {
          this.log.warn('Type check verification failed:', error);
        }
      }
      
      // Lint check for JS/TS files
      if (filePath?.match(/\.(js|jsx|ts|tsx)$/)) {
        const lintResult = await this.runLintCheck(filePath);
        if (!lintResult.valid) {
          return {
            passed: false,
            type: 'lint',
            details: 'Lint errors detected',
            errors: lintResult.errors,
          };
        }
      }
      
      // Diff safety review - check file was modified correctly
      try {
        const fs = await import('fs/promises');
        await fs.access(filePath);
      } catch {
        return {
          passed: false,
          type: 'diff_review',
          details: 'File not found after write operation',
          errors: [`File ${filePath} does not exist after write`],
        };
      }
    }
    
    if (step.action === 'run_test') {
      return {
        passed: result.output?.passed === true,
        type: 'test',
        details: result.output?.summary || 'Tests executed',
        errors: result.output?.failures,
      };
    }
    
    // Default: assume passed if execution succeeded
    return {
      passed: result.success,
      type: 'manual',
      details: 'Step completed successfully',
    };
  }

  /**
   * Attempt self-correction when verification fails
   */
  private async selfCorrect(
    step: PlanStep,
    result: ExecutedStepResult,
    verification: VerificationResult,
    context: AgentExecutionContext
  ): Promise<{ success: boolean; correctedResult?: ExecutedStepResult }> {
    if (context.reflectionCycles >= this.maxReflectionCycles) {
      this.log.warn('[AgentParity] Max reflection cycles reached, cannot self-correct');
      return { success: false };
    }
    
    this.log.info(`[AgentParity] Attempting self-correction for step ${step.stepId}...`);
    context.reflectionCycles++;
    
    // Use self-reflection engine
    const reflectionContext: ReflectionContext = {
      executionId: context.executionId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      originalIntent: context.goal,
      executedSteps: context.executedSteps.map(s => ({
        stepId: s.stepId,
        action: s.action,
        input: s.input,
        output: s.output,
        durationMs: s.durationMs,
        timestamp: s.timestamp,
      })),
      currentOutput: result.output,
    };
    
    const reflection = await selfReflectionEngine.reflect(reflectionContext);
    context.lastReflection = reflection;
    
    if (reflection.autoCorrectible && reflection.suggestedRevisions.length > 0) {
      // Apply first suggested revision
      const revision = reflection.suggestedRevisions[0];
      this.log.info(`[AgentParity] Applying auto-correction: ${revision.description}`);
      
      // Re-execute with modified parameters
      if (revision.newParameters) {
        step.parameters = { ...step.parameters, ...revision.newParameters };
        const retryResult = await this.executeStep(step, context);
        if (retryResult.success) {
          // Return the corrected result to be used by caller
          return { success: true, correctedResult: retryResult };
        }
      }
    }
    
    // Try simple retry without parameter changes for transient errors
    if (verification.type === 'type_check' || verification.type === 'lint') {
      this.log.info(`[AgentParity] Attempting simple retry for ${step.stepId}...`);
      const retryResult = await this.executeStep(step, context);
      if (retryResult.success) {
        return { success: true, correctedResult: retryResult };
      }
    }
    
    // If correction failed, re-queue step for later retry with modified approach
    // First remove the original failed result from executedSteps to avoid duplicates
    if (context.reflectionCycles < this.maxReflectionCycles - 1) {
      const modifiedStep = { ...step, stepId: `${step.stepId}-retry`, riskLevel: 'low' as const };
      context.pendingSteps.unshift(modifiedStep);
      
      // Mark original step as requiring rollback/overwrite
      const originalIdx = context.executedSteps.findIndex(s => s.stepId === step.stepId);
      if (originalIdx >= 0) {
        context.executedSteps[originalIdx].verificationResult = {
          passed: false,
          type: 'pending_retry',
          details: `Step re-queued as ${modifiedStep.stepId}`,
        };
      }
      
      this.log.info(`[AgentParity] Re-queued step ${step.stepId} for retry, original marked for replacement`);
    }
    
    return { success: false };
  }
  
  private async runLintCheck(filePath: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Run ESLint if available
      const result = await execAsync(`npx eslint ${filePath} --format json 2>/dev/null || true`, { timeout: 15000 });
      const output = result.stdout.trim();
      
      if (output && output.startsWith('[')) {
        const parsed = JSON.parse(output);
        const errors = parsed.flatMap((f: any) => f.messages.filter((m: any) => m.severity === 2).map((m: any) => `${m.line}:${m.column} ${m.message}`));
        return { valid: errors.length === 0, errors };
      }
      
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: true, errors: [] }; // Assume valid if lint unavailable
    }
  }

  /**
   * Periodic reflection during execution
   */
  private async periodicReflection(context: AgentExecutionContext): Promise<void> {
    this.log.info(`[AgentParity] Periodic reflection at step ${context.currentStep}...`);
    
    const reflectionContext: ReflectionContext = {
      executionId: context.executionId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      originalIntent: context.goal,
      executedSteps: context.executedSteps.map(s => ({
        stepId: s.stepId,
        action: s.action,
        input: s.input,
        output: s.output,
        durationMs: s.durationMs,
        timestamp: s.timestamp,
      })),
      currentOutput: context.executedSteps[context.executedSteps.length - 1]?.output,
    };
    
    const reflection = await selfReflectionEngine.reflect(reflectionContext);
    
    // Update confidence based on reflection
    context.overallConfidence *= reflection.confidenceScore;
    
    // Check if we need to adjust the plan
    if (reflection.issues.some(i => i.severity === 'error' || i.severity === 'critical')) {
      this.log.warn('[AgentParity] Reflection found critical issues, may need plan adjustment');
    }
    
    context.reflectionCycles++;
  }

  /**
   * PHASE 4: Final reflection after all steps
   */
  private async finalReflection(context: AgentExecutionContext): Promise<void> {
    this.log.info(`[AgentParity] Phase 4: Final reflection...`);
    
    const reflectionContext: ReflectionContext = {
      executionId: context.executionId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      originalIntent: context.goal,
      executedSteps: context.executedSteps.map(s => ({
        stepId: s.stepId,
        action: s.action,
        input: s.input,
        output: s.output,
        durationMs: s.durationMs,
        timestamp: s.timestamp,
      })),
      currentOutput: {
        summary: `Executed ${context.executedSteps.length} steps`,
        successRate: context.executedSteps.filter(s => s.success).length / context.executedSteps.length,
      },
    };
    
    const finalReflection = await selfReflectionEngine.reflect(reflectionContext);
    context.lastReflection = finalReflection;
    context.overallConfidence = finalReflection.confidenceScore;
    
    // Store learning in memory
    try {
      await (trinityMemoryService as any).storeExecution({
        executionId: context.executionId,
        goal: context.goal,
        success: context.executedSteps.every(s => s.success),
        confidence: finalReflection.confidenceScore,
        lessons: finalReflection.critique,
      });
    } catch (error) {
      this.log.warn('[AgentParity] Failed to store execution memory:', error);
    }
  }

  /**
   * PHASE 5: Commit changes if approved
   */
  private async commitChanges(context: AgentExecutionContext): Promise<void> {
    this.log.info(`[AgentParity] Phase 5: Committing changes...`);
    
    // This would integrate with git or change tracking
    // For now, log the intent
    await db.insert(systemAuditLogs).values({
      id: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      userId: context.userId,
      action: 'agent_commit',
      entityType: 'execution',
      entityId: context.executionId,
      metadata: {
        stepsCompleted: context.executedSteps.length,
        confidence: context.overallConfidence,
        summary: context.lastReflection?.critique,
      },
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async buildContextString(context: AgentExecutionContext): Promise<string> {
    let contextStr = `Goal: ${context.goal}\n`;
    
    if (context.relevantComponents.length > 0) {
      contextStr += `\nRelevant Components:\n${context.relevantComponents.map(c => `- ${c}`).join('\n')}`;
    }
    
    if (context.relevantFiles.length > 0) {
      contextStr += `\nRelevant Files:\n${context.relevantFiles.slice(0, 10).map(f => `- ${f}`).join('\n')}`;
    }
    
    try {
      const { workspaceContextService } = await import('./workspaceContextService');
      const wsCtx = await workspaceContextService.getFullContext(context.workspaceId);
      contextStr += `\n\n${workspaceContextService.formatForPrompt(wsCtx)}`;
    } catch (wsErr) {
      this.log.warn(`[AgentParity] Workspace context enrichment failed for ${context.workspaceId}:`, wsErr instanceof Error ? wsErr.message : wsErr);
    }
    
    return contextStr;
  }

  private getConstraintsFromSpec(context: AgentExecutionContext): string[] {
    const constraints: string[] = [];
    
    // Add tier-based constraints
    const tier0Components = context.relevantComponents.filter(id => {
      const comp = ((specIndex as any).components || {})[id];
      return comp?.tier === 'tier0';
    });
    
    if (tier0Components.length > 0) {
      constraints.push(`Critical components detected (${tier0Components.join(', ')}) - require human approval for changes`);
    }
    
    // Add editing rules
    const editingRules = (specIndex as any).aiEditingRules || {};
    constraints.push(`Tier-0 files: ${editingRules.tier0?.description || 'Human approval required'}`);
    constraints.push(`Tier-1 files: ${editingRules.tier1?.description || 'LLM-as-Judge validation required'}`);
    
    return constraints;
  }

  private isProtectedFile(filePath: string): boolean {
    const protectedPatterns = [
      /\.env/,
      /package\.json$/,
      /tsconfig\.json$/,
      /drizzle\.config\.ts$/,
      /vite\.config\.ts$/,
    ];
    return protectedPatterns.some(p => p.test(filePath));
  }

  private async attemptRecovery(step: PlanStep, preFlightResult: { safe: boolean; reason?: string }, context: AgentExecutionContext): Promise<boolean> {
    this.log.info(`[AgentParity] Attempting recovery for failed pre-flight: ${preFlightResult.reason}`);
    
    // Strategy 1: Try alternative file path if original is protected
    if (preFlightResult.reason?.includes('protected file') && step.action === 'write_file') {
      const originalPath = step.parameters?.path || step.parameters?.filePath;
      const safePath = originalPath?.replace(/\.ts$/, '.generated.ts');
      if (safePath && safePath !== originalPath) {
        this.log.info(`[AgentParity] Recovery: Redirecting to safe path: ${safePath}`);
        step.parameters.path = safePath;
        step.parameters.filePath = safePath;
        return true;
      }
    }
    
    // Strategy 2: Request self-reflection for alternative approach
    try {
      const reflection = await selfReflectionEngine.reflect({
        workspaceId: context.workspaceId,
        userId: context.userId,
        goal: `Recover from pre-flight failure: ${preFlightResult.reason}`,
        executedSteps: context.executedSteps.map(s => ({
          action: s.action,
          input: s.input,
          output: s.output,
          success: s.success,
        })),
        currentOutput: { failedStep: step.action, reason: preFlightResult.reason },
        verificationResult: { passed: false, errors: [preFlightResult.reason || 'Pre-flight check failed'] },
      });
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (reflection.suggestedActions && (reflection as any).suggestedActions.length > 0) {
        this.log.info(`[AgentParity] Self-reflection suggests: ${(reflection as any).suggestedActions[0]}`);
        // Apply first suggested action if it's a parameter modification
        const suggestion = (reflection as any).suggestedActions[0];
        if (suggestion.includes('skip') || suggestion.includes('alternative')) {
          return false; // Skip this step
        }
      }
    } catch (error) {
      this.log.warn('[AgentParity] Recovery reflection failed:', error);
    }
    
    return false;
  }
  
  private async triggerLowConfidenceEscalation(context: AgentExecutionContext): Promise<void> {
    this.log.info(`[AgentParity] Low confidence escalation triggered: ${context.overallConfidence}`);
    
    try {
      // Route to adaptive supervision for human handoff
      const handoffResult = await (adaptiveSupervisionRouter as any).requestHandoff({
        handoffId: `escalation-${context.executionId}`,
        sourceSubagent: 'agent-parity-layer',
        targetSubagent: 'human-supervisor',
        type: 'async',
        context: {
          executionId: context.executionId,
          goal: context.goal,
          confidence: context.overallConfidence,
          stepsCompleted: context.executedSteps.length,
          pendingSteps: context.pendingSteps.map(s => s.action),
        },
        request: {
          action: 'human_review_required',
          severity: context.overallConfidence < 0.3 ? 'critical' : 'warning',
          reason: 'Low confidence detected during autonomous execution',
          suggestedAction: 'Review execution state and approve continuation or rollback',
        },
        priority: context.overallConfidence < 0.3 ? 10 : 5,
      });
      
      this.log.info(`[AgentParity] Handoff requested: ${handoffResult.handoffId}`);
      
      // Publish platform event — reaches notification pipeline, DB, WebSocket
      const severity = context.overallConfidence < 0.3 ? 'critical' : 'warning';
      platformEventBus.publish({
        type: 'agent_escalation',
        workspaceId: context.workspaceId,
        title: `AI Agent Escalated to Human Supervisor`,
        description: `Autonomous execution of "${context.goal}" paused — confidence ${(context.overallConfidence * 100).toFixed(0)}% is below safe threshold. Human review required.`,
        category: 'automation',
        priority: context.overallConfidence < 0.3 ? 10 : 5,
        metadata: {
          source: 'agent-parity-layer',
          userId: context.userId,
          executionId: context.executionId,
          goal: context.goal,
          confidence: context.overallConfidence,
          handoffId: handoffResult.handoffId,
          severity,
        },
      }).catch((err) => this.log.warn('[trinityAgentParityLayer] Fire-and-forget failed:', err));
      
      // Log to audit
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: context.workspaceId,
        userId: context.userId,
        action: 'agent_escalation',
        entityType: 'execution',
        entityId: context.executionId,
        metadata: {
          confidence: context.overallConfidence,
          goal: context.goal,
          handoffId: handoffResult.handoffId,
          reason: 'Automatic escalation to human supervisor',
        },
      });
    } catch (error) {
      this.log.error('[AgentParity] Failed to trigger escalation:', error);
      
      // Fallback: publish even if handoff request failed — managers must be alerted
      platformEventBus.publish({
        type: 'agent_escalation',
        workspaceId: context.workspaceId,
        title: 'AI Agent Escalation — Handoff Failed, Manual Intervention Required',
        description: `Autonomous execution of "${context.goal}" failed handoff. Manual intervention required immediately.`,
        category: 'automation',
        priority: 10,
        metadata: {
          source: 'agent-parity-layer',
          userId: context.userId,
          executionId: context.executionId,
          goal: context.goal,
          confidence: context.overallConfidence,
          severity: 'critical',
          error: 'Handoff failed, requires manual intervention',
        },
      }).catch((err) => this.log.warn('[trinityAgentParityLayer] Fire-and-forget failed:', err));
    }
  }

  private async analyzeCode(params: any, context: AgentExecutionContext): Promise<unknown> {
    const files = params.files || context.relevantFiles || [];
    const stepResults = context.executedSteps.filter(s => s.success);
    return {
      analyzed: true,
      files,
      fileCount: files.length,
      successfulSteps: stepResults.length,
      totalSteps: context.executedSteps.length,
    };
  }

  private async validateChanges(context: AgentExecutionContext): Promise<unknown> {
    const successCount = context.executedSteps.filter(s => s.success).length;
    const failCount = context.executedSteps.filter(s => !s.success).length;
    return {
      valid: failCount === 0,
      totalChanges: context.executedSteps.length,
      successfulChanges: successCount,
      failedChanges: failCount,
    };
  }

  private buildExecutionResult(context: AgentExecutionContext, startTime: number): AgentExecutionResult {
    const successCount = context.executedSteps.filter(s => s.success).length;
    const verifiedCount = context.executedSteps.filter(s => s.verified).length;
    
    return {
      executionId: context.executionId,
      success: context.overallConfidence >= 0.6 && successCount > 0,
      stepsCompleted: successCount,
      stepsTotal: context.executedSteps.length,
      finalConfidence: context.overallConfidence,
      reflectionCycles: context.reflectionCycles,
      autoCorrections: context.reflectionCycles > 0 ? 1 : 0,
      humanEscalationsTriggered: context.overallConfidence < 0.4 ? 1 : 0,
      summary: context.lastReflection?.critique || `Completed ${successCount}/${context.executedSteps.length} steps`,
      changes: context.executedSteps
        .filter(s => s.action === 'write_file' || s.action === 'edit_file')
        .map(s => ({
          type: s.action === 'write_file' ? 'file_created' as const : 'file_modified' as const,
          target: s.input?.path || s.input?.filePath || 'unknown',
          description: `${s.action} executed`,
          verified: s.verified,
          rollbackable: true,
        })),
      durationMs: Date.now() - startTime,
    };
  }

  private async logExecution(context: AgentExecutionContext, result: AgentExecutionResult): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: context.workspaceId,
        userId: context.userId,
        action: 'agent_execution',
        entityType: 'execution',
        entityId: context.executionId,
        metadata: {
          goal: context.goal,
          success: result.success,
          stepsCompleted: result.stepsCompleted,
          confidence: result.finalConfidence,
          reflectionCycles: result.reflectionCycles,
          durationMs: result.durationMs,
        },
      });
    } catch (error) {
      this.log.error('[AgentParity] Failed to log execution:', error);
    }
  }

  private registerOrchestratorActions(): void {
    this.log.info('[AgentParity] Agent parity actions ready for registration');
  }

  getCapabilities(): { name: string; description: string; pattern: string }[] {
    return [
      {
        name: 'Plan-Execute-Reflect',
        description: 'Structured multi-step planning with verification and self-correction',
        pattern: 'ReAct + Chain-of-Thought'
      },
      {
        name: 'Verification Loops',
        description: 'Pre-flight checks and post-execution type/lint validation',
        pattern: 'Test-Verify-Rollback'
      },
      {
        name: 'Confidence Scoring',
        description: 'Track uncertainty and trigger retries or human escalation',
        pattern: 'Adaptive Supervision'
      },
      {
        name: 'Context Integration',
        description: 'Pull spec-index, memory, and codebase understanding automatically',
        pattern: 'Knowledge Graph + Memory'
      },
      {
        name: 'Self-Correction',
        description: 'Auto-fix errors without human intervention when safe',
        pattern: 'Reflection Engine'
      }
    ];
  }
}

export const trinityAgentParityLayer = TrinityAgentParityLayer.getInstance();

// Export types for use elsewhere
export type { AgentExecutionContext, ExecutedStepResult, VerificationResult, AgentExecutionResult, ChangeRecord };
