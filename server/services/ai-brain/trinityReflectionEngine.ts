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
import { usageMeteringService } from '../billing/usageMetering';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityReflectionEngine');

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
  fileContents?: Map<string, string>;
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

    log.info(`[TrinityReflection] Analyzing failure for finding ${context.findingId}, attempt ${context.attemptNumber}/${context.maxAttempts}`);

    try {
      const prompt = this.buildReflectionPrompt(context);
      // Platform-level reflection - billed to PLATFORM_COST_CENTER
      const result = await meteredGemini.generate({
        workspaceId: undefined as any,
        featureKey: 'trinity_reflection_analysis',
        prompt,
        model: 'gemini-2.5-pro',
        temperature: 0.3,
        maxOutputTokens: 2000,
      });

      if (!result.success) {
        return {
          shouldRetry: context.attemptNumber < context.maxAttempts,
          confidence: 0.3,
          diagnosis: `Reflection blocked: ${result.error}`,
          suggestedApproach: 'Retry with original approach',
          escalateToHuman: context.attemptNumber >= context.maxAttempts - 1,
          reasoningTrace: [`Billing gate: ${result.error}`],
        };
      }

      return this.parseReflectionResponse(result.text, context);
    } catch (error: any) {
      log.error('[TrinityReflection] Error during reflection:', (error instanceof Error ? error.message : String(error)));
      return {
        shouldRetry: context.attemptNumber < context.maxAttempts,
        confidence: 0.3,
        diagnosis: `Reflection failed: ${(error instanceof Error ? error.message : String(error))}`,
        suggestedApproach: 'Retry with original approach',
        escalateToHuman: context.attemptNumber >= context.maxAttempts - 1,
        reasoningTrace: [`Reflection error: ${(error instanceof Error ? error.message : String(error))}`],
      };
    }
  }

  /**
   * Build the reflection prompt for Gemini 3 Pro (Architect mode)
   * Now generates actual revised patches, not just approach descriptions
   */
  private buildReflectionPrompt(context: ReflectionContext): string {
    // Build file contents section if available
    let fileContentsSection = '';
    if (context.fileContents && context.fileContents.size > 0) {
      fileContentsSection = '\n## Current File Contents (After Failed Patch)\n';
      for (const [file, content] of context.fileContents) {
        const lines = content.split('\n');
        const numberedLines = lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
        fileContentsSection += `\n### ${file}\n\`\`\`\n${numberedLines.substring(0, 3000)}${lines.length > 50 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
      }
    }

    return `You are Trinity's Architect - a senior engineer analyzing a failed code fix attempt.
Your role is to generate ACTUAL REVISED PATCHES that will fix the errors, not just suggestions.

## Context
- Finding ID: ${context.findingId}
- Attempt: ${context.attemptNumber} of ${context.maxAttempts}
- Affected Files: ${context.affectedFiles.join(', ')}

## Original Error Being Fixed
${context.originalError}

## LSP/TypeScript Errors After Fix Attempt
${context.lspErrors.map(e => `${e.file}:${e.line}:${e.column} - ${e.message}`).join('\n') || context.tsErrors.join('\n')}

## Previous Patches Applied (THESE CAUSED THE ERRORS)
${JSON.stringify(context.previousPatches, null, 2)}
${fileContentsSection}
## Your Task
1. Analyze why the previous patches failed
2. Generate REVISED PATCHES that will actually fix the errors
3. Each patch should be a complete replacement/insertion operation

## Patch Format
Each patch in revisedPatches array must have:
- file: string (relative path)
- operation: "replace" | "insert" | "delete"
- search: string (for replace/delete - exact text to find)
- replace: string (for replace/insert - new text)
- line: number (for insert - line number to insert at)

Respond ONLY with this JSON (no markdown, no explanation):
{
  "diagnosis": "Root cause of failure",
  "shouldRetry": true,
  "confidence": 0.0-1.0,
  "suggestedApproach": "Brief description of fix strategy",
  "revisedPatches": [
    {
      "file": "path/to/file.ts",
      "operation": "replace",
      "search": "exact text to find",
      "replace": "replacement text"
    }
  ],
  "escalateToHuman": false,
  "reasoningTrace": ["Step 1: Identified issue...", "Step 2: Generated fix..."]
}`;
  }

  /**
   * Parse the Gemini reflection response
   * Now extracts revisedPatches for actual patch regeneration
   */
  private parseReflectionResponse(response: string, context: ReflectionContext): ReflectionResult {
    try {
      // Extract JSON from response (handle potential markdown wrapping)
      let jsonStr = response;
      
      // Strip markdown code blocks if present
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      
      // Find the JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and normalize revisedPatches
      let revisedPatches: any[] | undefined;
      if (Array.isArray(parsed.revisedPatches) && parsed.revisedPatches.length > 0) {
        const normalized = parsed.revisedPatches.map((patch: any) => ({
          file: patch.file || '',
          operation: patch.operation || 'replace',
          search: patch.search || '',
          replace: patch.replace || '',
          line: patch.line,
        })).filter((p: any) => p.file && (p.search || p.line));
        
        if (normalized.length > 0) {
          revisedPatches = normalized;
          log.info(`[TrinityReflection] Parsed ${normalized.length} revised patches from AI response`);
        }
      }
      
      return {
        shouldRetry: parsed.shouldRetry && context.attemptNumber < context.maxAttempts,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        diagnosis: parsed.diagnosis || 'Unknown failure',
        suggestedApproach: parsed.suggestedApproach || '',
        revisedPatches,
        escalateToHuman: parsed.escalateToHuman || parsed.confidence < REFLECTION_CONFIG.escalationThreshold,
        reasoningTrace: parsed.reasoningTrace || [],
      };
    } catch (error) {
      log.error('[TrinityReflection] Error parsing response:', error);
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
   * 
   * Now supports revisedPatches from reflection for actual patch regeneration
   */
  async runIterativeFixLoop(
    findingId: string,
    originalError: string,
    affectedFiles: string[],
    executeFix: (attempt: number, suggestedApproach?: string, revisedPatches?: any[]) => Promise<{ success: boolean; patches: any[] }>,
    readFileContents?: () => Promise<Map<string, string>>,
  ): Promise<{ success: boolean; attempts: IterationResult[]; finalResult?: ReflectionResult }> {
    const attempts: IterationResult[] = [];
    let lastPatches: any[] = [];
    
    log.info(`[TrinityReflection] Starting iterative fix loop for finding ${findingId}`);

    for (let attempt = 1; attempt <= REFLECTION_CONFIG.maxRetries; attempt++) {
      log.info(`[TrinityReflection] === Attempt ${attempt}/${REFLECTION_CONFIG.maxRetries} ===`);
      
      // Get reflection data from previous attempt
      const prevReflection = attempts.length > 0 
        ? attempts[attempts.length - 1].reflectionResult 
        : undefined;
      const suggestedApproach = prevReflection?.suggestedApproach;
      const revisedPatches = prevReflection?.revisedPatches;
      
      // Log if using revised patches
      if (revisedPatches && revisedPatches.length > 0) {
        log.info(`[TrinityReflection] Using ${revisedPatches.length} AI-generated revised patches for attempt ${attempt}`);
      }
      
      const fixResult = await executeFix(attempt, suggestedApproach, revisedPatches);
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
        log.info(`[TrinityReflection] Attempt ${attempt} succeeded - code is clean!`);
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
      log.info(`[TrinityReflection] Attempt ${attempt} has ${tsErrors.length} TypeScript errors`);
      
      // Read file contents for better reflection if available
      let fileContents: Map<string, string> | undefined;
      if (readFileContents) {
        try {
          fileContents = await readFileContents();
        } catch (e) {
          log.warn('[TrinityReflection] Could not read file contents for reflection');
        }
      }
      
      const reflectionResult = await this.reflectOnFailure({
        findingId,
        originalError,
        attemptNumber: attempt,
        maxAttempts: REFLECTION_CONFIG.maxRetries,
        affectedFiles,
        previousPatches: lastPatches,
        lspErrors,
        tsErrors,
        fileContents,
      });
      
      // Log if reflection generated revised patches
      if (reflectionResult.revisedPatches && reflectionResult.revisedPatches.length > 0) {
        log.info(`[TrinityReflection] Reflection generated ${reflectionResult.revisedPatches.length} revised patches`);
      }
      
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
        log.info(`[TrinityReflection] Stopping iteration - escalating to human`);
        
        await this.emitReflectionEvent('fix_escalated', {
          findingId,
          attempt,
          diagnosis: reflectionResult.diagnosis,
          confidence: reflectionResult.confidence,
        });
        
        return { success: false, attempts, finalResult: reflectionResult };
      }
      
      log.info(`[TrinityReflection] Will retry with${reflectionResult.revisedPatches ? ' revised patches and' : ''} suggested approach: ${reflectionResult.suggestedApproach}`);
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
    log.info(`[TrinityReflection] Running internal approval gate for finding ${findingId}`);
    
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
      title: `Reflection: ${eventType}`,
      description: data.diagnosis || `Reflection event for finding ${data.findingId}`,
      metadata: {
        ...data,
        timestamp: new Date().toISOString(),
        service: 'TrinityReflectionEngine',
      },
      visibility: 'org_leadership',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      log.error('[TrinityReflection] Failed to emit event:', error);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trinityReflectionEngine = TrinityReflectionEngineService.getInstance();

export async function initializeTrinityReflectionEngine(): Promise<void> {
  log.info('[TrinityReflection] Initializing Trinity Reflection Engine...');
  log.info('[TrinityReflection] Self-correction loop ready - max retries:', REFLECTION_CONFIG.maxRetries);
  log.info('[TrinityReflection] Using Gemini model:', GEMINI_MODELS.ARCHITECT);
}

export { TrinityReflectionEngineService };
