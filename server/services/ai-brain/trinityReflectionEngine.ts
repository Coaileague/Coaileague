/**
 * TRINITY REFLECTION ENGINE - Self-Correction Feedback Loop
 * ==========================================================
 * Implements the agent-architect pattern for Trinity's autonomous fixes:
 * 
 * 1. Trinity (Agent) generates and applies fixes
 * 2. LSP/TypeScript validation runs after each attempt
 * 3. If errors: Reflection Engine (Architect) analyzes failures with Gemini 3 Pro
 * 4. Generates improved fix specification
 * 5. Retries with adjusted approach (up to N attempts)
 * 6. Only proposes to user after internal validation passes
 * 
 * This mirrors the Replit Agent + Architect relationship for self-healing.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { GEMINI_MODELS, ThinkingLevel } from './providers/geminiClient';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { platformEventBus, PlatformEvent } from '../platformEventBus';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface ReflectionContext {
  findingId: string;
  originalError: string;
  attemptNumber: number;
  maxAttempts: number;
  affectedFiles: string[];
  previousPatches: any[];
  lspErrors: LspError[];
  tsErrors: string[];
}

export interface LspError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ReflectionResult {
  shouldRetry: boolean;
  confidence: number;
  diagnosis: string;
  suggestedApproach: string;
  revisedPatches?: any[];
  escalateToHuman: boolean;
  reasoningTrace: string[];
}

export interface IterationResult {
  success: boolean;
  attempt: number;
  lspClean: boolean;
  tsClean: boolean;
  errors: string[];
  reflectionResult?: ReflectionResult;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const REFLECTION_CONFIG = {
  maxRetries: 3,
  lspCheckTimeout: 30000,
  tsCheckTimeout: 60000,
  minConfidenceForRetry: 0.6,
  escalationThreshold: 0.4,
  thinkingLevel: 'high' as ThinkingLevel,
};

// ============================================================================
// TRINITY REFLECTION ENGINE
// ============================================================================

class TrinityReflectionEngineService {
  private static instance: TrinityReflectionEngineService;
  private genAI: GoogleGenerativeAI | null = null;
  private projectRoot: string;

  private constructor() {
    this.projectRoot = process.cwd();
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  static getInstance(): TrinityReflectionEngineService {
    if (!this.instance) {
      this.instance = new TrinityReflectionEngineService();
    }
    return this.instance;
  }

  // ==========================================================================
  // LSP ERROR DETECTION
  // ==========================================================================

  /**
   * Run TypeScript compiler and extract errors
   */
  async runTscCheck(affectedFiles?: string[]): Promise<{ clean: boolean; errors: string[] }> {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1', {
        cwd: this.projectRoot,
        timeout: REFLECTION_CONFIG.tsCheckTimeout,
      });
      
      const output = stdout + stderr;
      const errors: string[] = [];
      
      // Parse TypeScript errors
      const errorLines = output.split('\n').filter(line => 
        line.includes('error TS') || line.includes(': error')
      );
      
      // Filter to affected files if specified
      if (affectedFiles && affectedFiles.length > 0) {
        for (const line of errorLines) {
          const isAffected = affectedFiles.some(file => line.includes(file));
          if (isAffected) {
            errors.push(line.trim());
          }
        }
      } else {
        errors.push(...errorLines.map(l => l.trim()));
      }
      
      return { clean: errors.length === 0, errors };
    } catch (error: any) {
      // tsc returns non-zero exit code on errors
      const output = (error.stdout || '') + (error.stderr || '');
      const errorLines = output.split('\n').filter((line: string) => 
        line.includes('error TS') || line.includes(': error')
      );
      
      return { 
        clean: false, 
        errors: errorLines.slice(0, 20).map((l: string) => l.trim()) 
      };
    }
  }

  /**
   * Parse LSP-style diagnostics from TypeScript output
   */
  parseLspErrors(tsErrors: string[]): LspError[] {
    const lspErrors: LspError[] = [];
    
    for (const error of tsErrors) {
      // Parse format: file.ts(line,col): error TSxxxx: message
      const match = error.match(/(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*TS\d+:\s*(.+)/);
      if (match) {
        lspErrors.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4] as 'error' | 'warning',
          message: match[5],
        });
      }
    }
    
    return lspErrors;
  }

  // ==========================================================================
  // REFLECTION & SELF-CORRECTION
  // ==========================================================================

  /**
   * Analyze fix failure and generate improved approach using Gemini 3 Pro
   */
  async reflectOnFailure(context: ReflectionContext): Promise<ReflectionResult> {
    if (!this.genAI) {
      return {
        shouldRetry: false,
        confidence: 0,
        diagnosis: 'AI not available - cannot reflect on failure',
        suggestedApproach: '',
        escalateToHuman: true,
        reasoningTrace: ['No Gemini API key configured'],
      };
    }

    console.log(`[TrinityReflection] Analyzing failure for finding ${context.findingId}, attempt ${context.attemptNumber}/${context.maxAttempts}`);

    try {
      const model = this.genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.ARCHITECT,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,
        },
      });

      const prompt = this.buildReflectionPrompt(context);
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      return this.parseReflectionResponse(response, context);
    } catch (error: any) {
      console.error('[TrinityReflection] Error during reflection:', error.message);
      return {
        shouldRetry: context.attemptNumber < context.maxAttempts,
        confidence: 0.3,
        diagnosis: `Reflection failed: ${error.message}`,
        suggestedApproach: 'Retry with original approach',
        escalateToHuman: context.attemptNumber >= context.maxAttempts - 1,
        reasoningTrace: [`Reflection error: ${error.message}`],
      };
    }
  }

  /**
   * Build the reflection prompt for Gemini 3 Pro (Architect mode)
   */
  private buildReflectionPrompt(context: ReflectionContext): string {
    return `You are Trinity's Architect - a senior engineer analyzing a failed code fix attempt.

## Context
- Finding ID: ${context.findingId}
- Attempt: ${context.attemptNumber} of ${context.maxAttempts}
- Affected Files: ${context.affectedFiles.join(', ')}

## Original Error Being Fixed
${context.originalError}

## LSP/TypeScript Errors After Fix Attempt
${context.lspErrors.map(e => `${e.file}:${e.line} - ${e.message}`).join('\n') || context.tsErrors.join('\n')}

## Previous Patches Applied
${JSON.stringify(context.previousPatches, null, 2)}

## Your Task
Analyze why the fix failed and provide:
1. Root cause diagnosis
2. Whether to retry with a different approach
3. Specific suggestions for the revised fix
4. Confidence level (0-1) that retry will succeed
5. Whether to escalate to human if confidence is low

Respond in this JSON format:
{
  "diagnosis": "Why the fix failed",
  "shouldRetry": true/false,
  "confidence": 0.0-1.0,
  "suggestedApproach": "Specific revised approach",
  "escalateToHuman": true/false,
  "reasoningTrace": ["Step 1...", "Step 2..."]
}`;
  }

  /**
   * Parse the Gemini reflection response
   */
  private parseReflectionResponse(response: string, context: ReflectionContext): ReflectionResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        shouldRetry: parsed.shouldRetry && context.attemptNumber < context.maxAttempts,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        diagnosis: parsed.diagnosis || 'Unknown failure',
        suggestedApproach: parsed.suggestedApproach || '',
        escalateToHuman: parsed.escalateToHuman || parsed.confidence < REFLECTION_CONFIG.escalationThreshold,
        reasoningTrace: parsed.reasoningTrace || [],
      };
    } catch (error) {
      console.error('[TrinityReflection] Error parsing response:', error);
      return {
        shouldRetry: context.attemptNumber < context.maxAttempts - 1,
        confidence: 0.4,
        diagnosis: 'Could not parse reflection response',
        suggestedApproach: 'Retry with conservative approach',
        escalateToHuman: true,
        reasoningTrace: ['Parse error - defaulting to human escalation'],
      };
    }
  }

  // ==========================================================================
  // ITERATIVE FIX LOOP
  // ==========================================================================

  /**
   * Run the iterative fix loop with self-correction
   * This is the main entry point for autonomous fixes
   */
  async runIterativeFixLoop(
    findingId: string,
    originalError: string,
    affectedFiles: string[],
    executeFix: (attempt: number, suggestedApproach?: string) => Promise<{ success: boolean; patches: any[] }>,
  ): Promise<{ success: boolean; attempts: IterationResult[]; finalResult?: ReflectionResult }> {
    const attempts: IterationResult[] = [];
    let lastPatches: any[] = [];
    
    console.log(`[TrinityReflection] Starting iterative fix loop for finding ${findingId}`);

    for (let attempt = 1; attempt <= REFLECTION_CONFIG.maxRetries; attempt++) {
      console.log(`[TrinityReflection] === Attempt ${attempt}/${REFLECTION_CONFIG.maxRetries} ===`);
      
      // Execute the fix
      const suggestedApproach = attempts.length > 0 
        ? attempts[attempts.length - 1].reflectionResult?.suggestedApproach 
        : undefined;
      
      const fixResult = await executeFix(attempt, suggestedApproach);
      lastPatches = fixResult.patches || [];
      
      if (!fixResult.success) {
        attempts.push({
          success: false,
          attempt,
          lspClean: false,
          tsClean: false,
          errors: ['Fix execution failed'],
        });
        continue;
      }
      
      // Run TypeScript/LSP validation
      const { clean: tsClean, errors: tsErrors } = await this.runTscCheck(affectedFiles);
      const lspErrors = this.parseLspErrors(tsErrors);
      
      if (tsClean) {
        console.log(`[TrinityReflection] Attempt ${attempt} succeeded - code is clean!`);
        attempts.push({
          success: true,
          attempt,
          lspClean: true,
          tsClean: true,
          errors: [],
        });
        
        // Emit success event
        await this.emitReflectionEvent('fix_validated', {
          findingId,
          attempt,
          success: true,
        });
        
        return { success: true, attempts };
      }
      
      // Fix failed validation - reflect and potentially retry
      console.log(`[TrinityReflection] Attempt ${attempt} has ${tsErrors.length} TypeScript errors`);
      
      const reflectionResult = await this.reflectOnFailure({
        findingId,
        originalError,
        attemptNumber: attempt,
        maxAttempts: REFLECTION_CONFIG.maxRetries,
        affectedFiles,
        previousPatches: lastPatches,
        lspErrors,
        tsErrors,
      });
      
      attempts.push({
        success: false,
        attempt,
        lspClean: lspErrors.length === 0,
        tsClean: false,
        errors: tsErrors.slice(0, 10),
        reflectionResult,
      });
      
      // Check if we should stop retrying
      if (!reflectionResult.shouldRetry || reflectionResult.escalateToHuman) {
        console.log(`[TrinityReflection] Stopping iteration - escalating to human`);
        
        await this.emitReflectionEvent('fix_escalated', {
          findingId,
          attempt,
          diagnosis: reflectionResult.diagnosis,
          confidence: reflectionResult.confidence,
        });
        
        return { success: false, attempts, finalResult: reflectionResult };
      }
      
      console.log(`[TrinityReflection] Will retry with suggested approach: ${reflectionResult.suggestedApproach}`);
    }
    
    // All attempts exhausted
    const finalReflection: ReflectionResult = {
      shouldRetry: false,
      confidence: 0,
      diagnosis: 'All retry attempts exhausted',
      suggestedApproach: '',
      escalateToHuman: true,
      reasoningTrace: attempts.map(a => `Attempt ${a.attempt}: ${a.errors[0] || 'unknown'}`),
    };
    
    await this.emitReflectionEvent('fix_exhausted', {
      findingId,
      totalAttempts: attempts.length,
    });
    
    return { success: false, attempts, finalResult: finalReflection };
  }

  // ==========================================================================
  // INTERNAL APPROVAL GATE
  // ==========================================================================

  /**
   * Internal validation before proposing to user
   * Only clean fixes should reach the user approval queue
   */
  async validateBeforeProposal(
    findingId: string,
    affectedFiles: string[],
  ): Promise<{ approved: boolean; reason: string }> {
    console.log(`[TrinityReflection] Running internal approval gate for finding ${findingId}`);
    
    // Run TypeScript check
    const { clean, errors } = await this.runTscCheck(affectedFiles);
    
    if (!clean) {
      return {
        approved: false,
        reason: `TypeScript validation failed with ${errors.length} errors. First error: ${errors[0] || 'unknown'}`,
      };
    }
    
    // All checks passed
    return {
      approved: true,
      reason: 'All validation checks passed - ready for user proposal',
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async emitReflectionEvent(eventType: string, data: any): Promise<void> {
    const event: PlatformEvent = {
      type: eventType as any,
      category: 'automation' as any,
      title: `Trinity Reflection: ${eventType}`,
      description: data.diagnosis || `Reflection event for finding ${data.findingId}`,
      metadata: {
        ...data,
        timestamp: new Date().toISOString(),
        service: 'TrinityReflectionEngine',
      },
      visibility: 'admin',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      console.error('[TrinityReflection] Failed to emit event:', error);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trinityReflectionEngine = TrinityReflectionEngineService.getInstance();

export async function initializeTrinityReflectionEngine(): Promise<void> {
  console.log('[TrinityReflection] Initializing Trinity Reflection Engine...');
  console.log('[TrinityReflection] Self-correction loop ready - max retries:', REFLECTION_CONFIG.maxRetries);
  console.log('[TrinityReflection] Using Gemini model:', GEMINI_MODELS.ARCHITECT);
}

export { TrinityReflectionEngineService };
