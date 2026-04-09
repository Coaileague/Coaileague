/**
 * AUTONOMOUS FIX PIPELINE - Trinity Self-Healing Code System
 * ============================================================
 * Orchestrates the complete autonomous fix lifecycle:
 * 1. Fix Specification Generation - AI analyzes findings and proposes fixes
 * 2. Code Edits - Applies patches via TrinityCodeOps
 * 3. Validation - TypeScript/lint checks before commit
 * 4. Self-Correction Loop - Iterates with Gemini 3 Pro reflection (up to 3 retries)
 * 5. Internal Approval Gate - Only clean fixes reach user proposals
 * 6. Approval Request - Human-in-the-loop for critical changes
 * 7. Commit & Restart - Git commit and workflow restart
 * 
 * Implements Agent-Architect pattern:
 * - Trinity (Agent): Generates and applies fixes
 * - Reflection Engine (Architect): Deep diagnosis on failures using Gemini 3 Pro
 * 
 * Part of Trinity's Full Platform Awareness initiative.
 */

import { exec } from 'child_process';
import { createLogger } from '../../../lib/logger';
const log = createLogger("autonomousFixPipeline");
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';
import { AI } from '../../../config/platformConfig';
import { db } from '../../../db';
import { aiGapFindings, aiWorkflowApprovals } from '@shared/schema';
import { eq, and, desc, sql, inArray, gte } from 'drizzle-orm';
import { trinityCodeOps, PatchOperation, PatchResult } from './trinityCodeOps';
import { workflowApprovalService } from '../workflowApprovalService';
import { gapIntelligenceService } from '../gapIntelligenceService';
import { helpaiOrchestrator } from '../../helpai/platformActionHub';
import { platformEventBus, PlatformEvent } from '../../platformEventBus';
import { GapFinding } from '../subagents/domainOpsSubagents';
import { trinityOrchestrationGovernance, hotpatchCadenceController } from '../trinityOrchestrationGovernance';
import { trinityReflectionEngine } from '../trinityReflectionEngine';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface FixSpecification {
  findingId: string;
  title: string;
  approach: string;
  patches: PatchOperation[];
  affectedFiles: string[];
  rollbackPlan: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  requiresApproval: boolean;
  estimatedImpact: string;
}

export interface FixExecutionResult {
  success: boolean;
  findingId: string;
  specificationId: string;
  patchResult?: PatchResult;
  validationPassed: boolean;
  validationErrors: string[];
  approvalId?: string;
  commitHash?: string;
  rollbackAvailable: boolean;
  message: string;
}

export interface PipelineConfig {
  autoApproveThreshold: number;
  maxConcurrentFixes: number;
  validationTimeout: number;
  commitAuthor: string;
  autoRestartWorkflows: boolean;
  dryRunByDefault: boolean;
}

const DEFAULT_CONFIG: PipelineConfig = {
  autoApproveThreshold: AI.autoApproveThreshold,
  maxConcurrentFixes: 3,
  validationTimeout: 120000,
  commitAuthor: 'Trinity AI <trinity@coaileague.ai>',
  autoRestartWorkflows: true,
  dryRunByDefault: false,
};

// ============================================================================
// AUTONOMOUS FIX PIPELINE SERVICE
// ============================================================================

class AutonomousFixPipelineService {
  private static instance: AutonomousFixPipelineService;
  private config: PipelineConfig;
  private activeFixes: Map<string, { status: string; startedAt: Date }> = new Map();
  private projectRoot: string;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.projectRoot = process.cwd();
  }

  static getInstance(): AutonomousFixPipelineService {
    if (!this.instance) {
      this.instance = new AutonomousFixPipelineService();
    }
    return this.instance;
  }

  // ==========================================================================
  // FIX SPECIFICATION GENERATION
  // ==========================================================================

  /**
   * Generate a fix specification from a gap finding
   */
  async generateFixSpecification(findingId: string): Promise<FixSpecification | null> {
    try {
      const [finding] = await db
        .select()
        .from(aiGapFindings)
        .where(eq(aiGapFindings.id, findingId));

      if (!finding) {
        log.error(`[AutonomousFix] Finding ${findingId} not found`);
        return null;
      }

      log.info(`[AutonomousFix] Generating fix spec for: ${finding.title}`);

      const spec = await this.createSpecFromFinding(finding);
      
      if (!spec) {
        log.info(`[AutonomousFix] Could not generate fix for finding ${findingId}`);
        return null;
      }

      log.info(`[AutonomousFix] Generated spec with ${spec.patches.length} patches, confidence: ${spec.confidence}`);
      return spec;
    } catch (error) {
      log.error(`[AutonomousFix] Error generating fix spec:`, error);
      return null;
    }
  }

  /**
   * Create fix specification from finding data
   */
  private async createSpecFromFinding(finding: any): Promise<FixSpecification | null> {
    const gapType = finding.gapType || '';
    const filePath = finding.filePath;
    const lineNumber = finding.lineNumber;
    const description = finding.description || '';
    const suggestedFix = finding.suggestedFix || '';

    // Read the file content if it exists
    let fileContent = '';
    if (filePath && fs.existsSync(path.resolve(this.projectRoot, filePath))) {
      try {
        fileContent = fs.readFileSync(path.resolve(this.projectRoot, filePath), 'utf-8');
      } catch (e) {
        log.warn(`[AutonomousFix] Could not read file ${filePath}`);
      }
    }

    // Generate patches based on gap type
    const patches: PatchOperation[] = [];
    let approach = '';
    let confidence = 0.7;

    if (gapType === 'typescript_error' && filePath) {
      const patch = await this.generateTypeScriptFix(finding, fileContent);
      if (patch) {
        patches.push(patch);
        approach = `Fix TypeScript error: ${suggestedFix || description}`;
        confidence = 0.85;
      }
    } else if (gapType.includes('missing_import')) {
      const patch = this.generateImportFix(finding, fileContent);
      if (patch) {
        patches.push(patch);
        approach = `Add missing import for ${finding.title}`;
        confidence = 0.9;
      }
    } else if (gapType.includes('unused') || gapType.includes('dead_code')) {
      const patch = this.generateRemovalFix(finding, fileContent);
      if (patch) {
        patches.push(patch);
        approach = `Remove unused code: ${finding.title}`;
        confidence = 0.8;
      }
    } else {
      // Generic fix attempt using suggested fix
      if (suggestedFix && filePath && fileContent) {
        approach = `Apply suggested fix: ${suggestedFix}`;
        confidence = 0.6;
      } else {
        return null;
      }
    }

    if (patches.length === 0) {
      return null;
    }

    const affectedFiles = [...new Set(patches.map(p => p.file))];
    const riskLevel = this.assessRiskLevel(finding, patches);
    const requiresApproval = confidence < this.config.autoApproveThreshold || riskLevel !== 'low';

    return {
      findingId: finding.id,
      title: `Fix: ${finding.title?.substring(0, 100) || 'Unknown issue'}`,
      approach,
      patches,
      affectedFiles,
      rollbackPlan: 'Git revert to previous commit',
      riskLevel,
      confidence,
      requiresApproval,
      estimatedImpact: `Modifies ${affectedFiles.length} file(s) to resolve ${gapType}`,
    };
  }

  /**
   * Generate TypeScript error fix patch
   */
  private async generateTypeScriptFix(finding: any, fileContent: string): Promise<PatchOperation | null> {
    if (!finding.filePath || !fileContent) return null;

    const errorCode = finding.title?.match(/TS\d+/)?.[0];
    const lineNum = finding.lineNumber || 1;
    const lines = fileContent.split('\n');
    
    if (lineNum > lines.length) return null;

    const targetLine = lines[lineNum - 1];

    // Common TypeScript fixes
    if (errorCode === 'TS2531' || errorCode === 'TS2532') {
      // Object is possibly null/undefined - add optional chaining
      const fixedLine = this.addOptionalChaining(targetLine);
      if (fixedLine !== targetLine) {
        return {
          type: 'replace',
          file: finding.filePath,
          oldContent: targetLine,
          newContent: fixedLine,
          description: 'Add optional chaining to handle null/undefined',
        };
      }
    } else if (errorCode === 'TS2345' || errorCode === 'TS2322') {
      // Type mismatch - try to add type assertion
      const fixedLine = this.addTypeAssertion(targetLine, finding.description);
      if (fixedLine !== targetLine) {
        return {
          type: 'replace',
          file: finding.filePath,
          oldContent: targetLine,
          newContent: fixedLine,
          description: 'Add type assertion to fix type mismatch',
        };
      }
    } else if (errorCode === 'TS7006') {
      // Parameter implicitly has 'any' type - add type annotation
      const fixedLine = this.addTypeAnnotation(targetLine);
      if (fixedLine !== targetLine) {
        return {
          type: 'replace',
          file: finding.filePath,
          oldContent: targetLine,
          newContent: fixedLine,
          description: 'Add explicit type annotation',
        };
      }
    }

    return null;
  }

  /**
   * Add optional chaining to fix null/undefined errors
   * SAFETY: Only adds ?. to the FIRST property access that looks like a variable
   * Does NOT blindly replace all dot accesses
   */
  private addOptionalChaining(line: string): string {
    // Known safe objects that never need optional chaining
    const safeObjects = [
      'this', 'console', 'Math', 'JSON', 'Object', 'Array', 'String', 
      'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise',
      'process', 'module', 'exports', 'require', 'window', 'document'
    ];
    
    // Only target the FIRST variable-like access that could be null
    // Pattern: variableName.property (where variableName starts with lowercase and is not a safe object)
    const match = line.match(/\b([a-z_$][a-zA-Z0-9_$]*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    
    if (!match) return line;
    
    const [fullMatch, obj, prop] = match;
    
    // Skip if it's already optional chaining, or is a safe object
    if (line.includes(`${obj}?.${prop}`)) return line;
    if (safeObjects.includes(obj)) return line;
    
    // Only replace the first occurrence to be conservative
    return line.replace(fullMatch, `${obj}?.${prop}`);
  }

  /**
   * Add type assertion
   * SAFETY: Only applies if clearly an assignment and type word appears in error
   * Conservative approach - returns unchanged line if conditions aren't clear
   */
  private addTypeAssertion(line: string, description: string): string {
    // Only proceed if description explicitly mentions 'type' and line is an assignment
    if (!description?.toLowerCase().includes('type')) return line;
    if (!line.includes('=')) return line;
    if (line.includes(' as ')) return line; // Already has assertion
    if (line.trim().startsWith('//')) return line; // Comment
    if (line.trim().startsWith('import')) return line; // Import statement
    if (line.trim().startsWith('export')) return line; // Export statement
    
    const [left, ...rest] = line.split('=');
    const right = rest.join('=').trim();
    
    // Must have a non-empty right side that isn't just a type annotation
    if (!right || right.startsWith('>') || right.startsWith(':')) return line;
    
    return `${left}= (${right.replace(/;$/, '')}) as any;`;
  }

  /**
   * Add type annotation
   * SAFETY: Only targets function parameters that are single words
   */
  private addTypeAnnotation(line: string): string {
    // Only target function parameters - look for arrow functions or function declarations
    if (!line.includes('=>') && !line.includes('function')) return line;
    
    // Pattern: (param) -> (param: any) but only for single-word params without existing types
    return line.replace(/\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)/g, (match, param) => {
      // Don't modify if it already has a type annotation nearby
      if (line.includes(`${param}:`)) return match;
      return `(${param}: any)`;
    });
  }

  /**
   * Generate import fix patch
   */
  private generateImportFix(finding: any, fileContent: string): PatchOperation | null {
    if (!finding.filePath || !fileContent) return null;

    const missingImport = finding.title?.match(/Cannot find.*'(\w+)'/)?.[1];
    if (!missingImport) return null;

    // Find first import line
    const lines = fileContent.split('\n');
    let lastImportLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        lastImportLine = i;
      }
    }

    const importLine = lines[lastImportLine];
    const newImport = `import { ${missingImport} } from './${missingImport}';\n`;

    return {
      type: 'replace',
      file: finding.filePath,
      oldContent: importLine,
      newContent: importLine + '\n' + newImport,
      description: `Add import for ${missingImport}`,
    };
  }

  /**
   * Generate removal fix patch
   */
  private generateRemovalFix(finding: any, fileContent: string): PatchOperation | null {
    if (!finding.filePath || !fileContent || !finding.lineNumber) return null;

    const lines = fileContent.split('\n');
    const lineNum = finding.lineNumber;
    
    if (lineNum > lines.length) return null;

    const targetLine = lines[lineNum - 1];

    return {
      type: 'replace',
      file: finding.filePath,
      startLine: lineNum,
      endLine: lineNum,
      oldContent: targetLine,
      newContent: '', // Remove the line
      description: `Remove unused code at line ${lineNum}`,
    };
  }

  // ==========================================================================
  // FIX EXECUTION
  // ==========================================================================

  /**
   * Execute a fix specification
   */
  async executeFix(
    spec: FixSpecification,
    options: { dryRun?: boolean; skipApproval?: boolean; autoCommit?: boolean } = {}
  ): Promise<FixExecutionResult> {
    const { dryRun = this.config.dryRunByDefault, skipApproval = false, autoCommit = true } = options;
    
    // Enforce max concurrent fixes
    const activeCount = this.activeFixes.size;
    if (activeCount >= this.config.maxConcurrentFixes) {
      log.warn(`[AutonomousFix] Max concurrent fixes reached (${activeCount}/${this.config.maxConcurrentFixes})`);
      return {
        success: false,
        findingId: spec.findingId,
        specificationId: `spec_${spec.findingId}`,
        validationPassed: false,
        validationErrors: ['Max concurrent fixes limit reached'],
        rollbackAvailable: false,
        message: `Cannot execute: ${activeCount} fixes already in progress (max: ${this.config.maxConcurrentFixes})`,
      };
    }

    // Check if this finding is already being processed
    if (this.activeFixes.has(spec.findingId)) {
      log.warn(`[AutonomousFix] Finding ${spec.findingId} is already being processed`);
      return {
        success: false,
        findingId: spec.findingId,
        specificationId: `spec_${spec.findingId}`,
        validationPassed: false,
        validationErrors: ['Fix already in progress for this finding'],
        rollbackAvailable: false,
        message: `Finding ${spec.findingId} is already being processed`,
      };
    }
    
    log.info(`[AutonomousFix] Executing fix for finding ${spec.findingId} (${activeCount + 1}/${this.config.maxConcurrentFixes} active)`);
    
    // Track active fix
    this.activeFixes.set(spec.findingId, { status: 'executing', startedAt: new Date() });

    try {
      // Check if approval is needed
      if (spec.requiresApproval && !skipApproval) {
        const approval = await workflowApprovalService.createApprovalFromFinding(
          {
            id: spec.findingId,
            filePath: spec.affectedFiles[0],
            gapType: 'auto_fix',
            severity: spec.riskLevel === 'critical' ? 'critical' : spec.riskLevel === 'high' ? 'error' : 'warning',
            title: spec.title,
            description: spec.approach,
            confidence: spec.confidence,
            detectionMethod: 'autonomous_fix_pipeline',
          } as unknown as GapFinding & { id: number },
          {
            affectedFiles: spec.affectedFiles,
            changes: spec.patches,
            rollbackPlan: spec.rollbackPlan,
          }
        );

        if (approval) {
          this.activeFixes.set(spec.findingId, { status: 'awaiting_approval', startedAt: new Date() });
          
          return {
            success: true,
            findingId: spec.findingId,
            specificationId: `spec_${spec.findingId}`,
            validationPassed: false,
            validationErrors: [],
            approvalId: approval.id,
            rollbackAvailable: false,
            message: `Approval required. Request created: ${approval.id}`,
          };
        }
      }

      // HOTPATCH CADENCE ENFORCEMENT: 1 patch/day during maintenance window
      const hotpatchWindow = await hotpatchCadenceController.checkWindow();
      if (!hotpatchWindow.allowed) {
        log.info(`[AutonomousFix] Hotpatch blocked: ${hotpatchWindow.reason}`);
        log.info(`[AutonomousFix] Next window: ${hotpatchWindow.nextWindowStart.toISOString()}`);
        this.activeFixes.delete(spec.findingId);

        return {
          success: false,
          findingId: spec.findingId,
          specificationId: `spec_${spec.findingId}`,
          validationPassed: false,
          validationErrors: [hotpatchWindow.reason],
          rollbackAvailable: false,
          message: `Hotpatch blocked: ${hotpatchWindow.reason}. Next window: ${hotpatchWindow.nextWindowStart.toISOString()}`,
        };
      }

      // Apply patches (dry run or real)
      if (dryRun) {
        log.info(`[AutonomousFix] DRY RUN - would apply ${spec.patches.length} patches`);
        this.activeFixes.delete(spec.findingId);
        
        return {
          success: true,
          findingId: spec.findingId,
          specificationId: `spec_${spec.findingId}`,
          validationPassed: true,
          validationErrors: [],
          rollbackAvailable: false,
          message: `DRY RUN: Would apply ${spec.patches.length} patches to ${spec.affectedFiles.length} files`,
        };
      }

      // Record hotpatch cadence (increment daily counter)
      await hotpatchCadenceController.recordPatch();
      log.info(`[AutonomousFix] Hotpatch recorded (${hotpatchWindow.patchesToday + 1}/${hotpatchWindow.dailyLimit} today)`);

      // Apply patches
      const patchResult = await trinityCodeOps.applyPatch({
        operationId: `autofix_${spec.findingId}_${Date.now()}`,
        workspaceId: 'system',
        userId: 'trinity',
        patches: spec.patches,
        commitMessage: autoCommit ? `[Trinity AutoFix] ${spec.title}` : undefined,
        autoCommit: false, // We'll commit after validation
        reasoning: spec.approach,
      });

      if (!patchResult.success) {
        this.activeFixes.delete(spec.findingId);
        
        return {
          success: false,
          findingId: spec.findingId,
          specificationId: `spec_${spec.findingId}`,
          patchResult,
          validationPassed: false,
          validationErrors: patchResult.errors,
          rollbackAvailable: patchResult.rollbackAvailable,
          message: `Patch application failed: ${patchResult.errors.join(', ')}`,
        };
      }

      // Validate changes
      const validation = await this.validateChanges(spec.affectedFiles);
      
      if (!validation.passed) {
        // Rollback on validation failure
        await trinityCodeOps.rollbackOperation(patchResult.operationId);
        this.activeFixes.delete(spec.findingId);
        
        return {
          success: false,
          findingId: spec.findingId,
          specificationId: `spec_${spec.findingId}`,
          patchResult,
          validationPassed: false,
          validationErrors: validation.errors,
          rollbackAvailable: false,
          message: `Validation failed: ${validation.errors.join(', ')}. Changes rolled back.`,
        };
      }

      // Commit if auto-commit enabled
      let commitHash: string | undefined;
      if (autoCommit) {
        const commitResult = await trinityCodeOps.commitChanges({
          workspaceId: 'system',
          userId: 'trinity',
          files: spec.affectedFiles,
          message: `[AutoFix] ${spec.title}\n\nApproach: ${spec.approach}\nConfidence: ${(spec.confidence * 100).toFixed(0)}%`,
          author: this.config.commitAuthor,
        });
        commitHash = commitResult.commitHash;
      }

      // Mark finding as resolved
      await gapIntelligenceService.markFindingResolved(spec.findingId, 'Trinity:AutoFix');

      // Emit success event
      await this.emitFixEvent('fix_applied', spec, commitHash);

      // Trigger workflow restart after successful fix
      if (this.config.autoRestartWorkflows) {
        await this.restartWorkflows();
      }

      this.activeFixes.delete(spec.findingId);

      return {
        success: true,
        findingId: spec.findingId,
        specificationId: `spec_${spec.findingId}`,
        patchResult,
        validationPassed: true,
        validationErrors: [],
        commitHash,
        rollbackAvailable: true,
        message: `Fix applied successfully${commitHash ? ` (commit: ${commitHash.substring(0, 7)})` : ''}`,
      };

    } catch (error: any) {
      log.error(`[AutonomousFix] Error executing fix:`, error);
      this.activeFixes.delete(spec.findingId);
      
      return {
        success: false,
        findingId: spec.findingId,
        specificationId: `spec_${spec.findingId}`,
        validationPassed: false,
        validationErrors: [(error instanceof Error ? error.message : String(error))],
        rollbackAvailable: false,
        message: `Execution error: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  /**
   * Execute a fix when approval is granted
   */
  async executeApprovedFix(approvalId: string): Promise<FixExecutionResult> {
    try {
      const approval = await workflowApprovalService.getApprovalById(approvalId);
      
      if (!approval) {
        return {
          success: false,
          findingId: '',
          specificationId: '',
          validationPassed: false,
          validationErrors: ['Approval not found'],
          rollbackAvailable: false,
          message: 'Approval request not found',
        };
      }

      if (approval.status !== 'approved') {
        return {
          success: false,
          findingId: approval.gapFindingId || '',
          specificationId: '',
          validationPassed: false,
          validationErrors: [`Approval status is ${approval.status}`],
          rollbackAvailable: false,
          message: `Cannot execute: approval status is ${approval.status}`,
        };
      }

      // Get the proposed changes
      const proposedChanges = approval.proposedChanges as PatchOperation[] | undefined;
      
      if (!proposedChanges || !Array.isArray(proposedChanges)) {
        return {
          success: false,
          findingId: approval.gapFindingId || '',
          specificationId: '',
          validationPassed: false,
          validationErrors: ['No proposed changes found'],
          rollbackAvailable: false,
          message: 'No proposed changes in approval',
        };
      }

      // Create spec from approval
      const spec: FixSpecification = {
        findingId: approval.gapFindingId || '',
        title: approval.title,
        approach: approval.description,
        patches: proposedChanges,
        affectedFiles: approval.affectedFiles || [],
        rollbackPlan: approval.rollbackPlan || 'Git revert',
        riskLevel: (approval.riskLevel as any) || 'medium',
        confidence: 1.0, // Approved = full confidence
        requiresApproval: false,
        estimatedImpact: `Approved fix for ${approval.title}`,
      };

      // Execute without approval check
      const result = await this.executeFix(spec, { skipApproval: true, autoCommit: true });

      // Mark approval as executed
      if (result.success) {
        await workflowApprovalService.markExecuted(approvalId, result.message);
      }

      return result;
    } catch (error: any) {
      log.error(`[AutonomousFix] Error executing approved fix:`, error);
      return {
        success: false,
        findingId: '',
        specificationId: '',
        validationPassed: false,
        validationErrors: [(error instanceof Error ? error.message : String(error))],
        rollbackAvailable: false,
        message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  // ==========================================================================
  // ITERATIVE FIX WITH SELF-CORRECTION (Agent-Architect Pattern)
  // ==========================================================================

  /**
   * Execute a fix with iterative self-correction loop
   * Uses Reflection Engine (Architect) for deep diagnosis on failures
   * Only proposes to user after internal validation passes
   * 
   * Flow:
   * 1. Generate initial spec
   * 2. Apply patches and validate
   * 3. If validation fails: Reflect (Gemini 3 Pro) and generate revised spec
   * 4. Repeat up to maxRetries
   * 5. On success: Run internal approval gate, then commit/propose
   */
  async executeFixWithReflection(
    findingId: string,
    options: { maxRetries?: number; skipUserProposal?: boolean } = {}
  ): Promise<FixExecutionResult & { reflectionSummary?: string }> {
    const { maxRetries = 3, skipUserProposal = false } = options;
    
    log.info(`[AutonomousFix] Starting iterative fix with reflection for finding ${findingId}`);
    
    // Get the finding
    const [finding] = await db
      .select()
      .from(aiGapFindings)
      .where(eq(aiGapFindings.id, findingId));
    
    if (!finding) {
      return {
        success: false,
        findingId,
        specificationId: '',
        validationPassed: false,
        validationErrors: ['Finding not found'],
        rollbackAvailable: false,
        message: 'Finding not found',
      };
    }
    
    // Track the validated spec that passes
    let validatedSpec: FixSpecification | null = null;
    let lastOperationId: string | undefined;
    
    // Helper to read file contents for reflection
    const readFileContents = async (): Promise<Map<string, string>> => {
      const contents = new Map<string, string>();
      const filePath = finding.filePath;
      if (filePath) {
        try {
          const fullPath = path.resolve(this.projectRoot, filePath);
          if (fs.existsSync(fullPath)) {
            contents.set(filePath, fs.readFileSync(fullPath, 'utf-8'));
          }
        } catch (e) {
          log.warn(`[AutonomousFix] Could not read ${filePath} for reflection`);
        }
      }
      return contents;
    };

    // Run iterative fix loop with reflection (now with revisedPatches support)
    const iterationResult = await trinityReflectionEngine.runIterativeFixLoop(
      findingId,
      finding.description,
      finding.filePath ? [finding.filePath] : [],
      async (attempt: any, suggestedApproach: any, revisedPatches: any) => {
        // Rollback previous attempt if it exists
        if (lastOperationId) {
          await trinityCodeOps.rollbackOperation(lastOperationId);
          lastOperationId = undefined;
        }
        
        let patchesToApply: PatchOperation[];
        let approach: string;
        
        // Use AI-generated revised patches if available (from reflection)
        if (revisedPatches && revisedPatches.length > 0 && attempt > 1) {
          log.info(`[AutonomousFix] Using ${revisedPatches.length} AI-revised patches for attempt ${attempt}`);
          
          // Convert reflection patches to valid PatchOperation format
          // Reflection format: {operation, file, search, replace, line}
          // PatchOperation format: {type, file, startLine, endLine, oldContent, newContent, description}
          patchesToApply = revisedPatches.map((p: any): PatchOperation => ({
            type: (p.operation || 'replace') as 'insert' | 'delete' | 'replace',
            file: p.file,
            startLine: p.line,
            endLine: p.line,
            oldContent: p.search || undefined,
            newContent: p.replace || undefined,
            description: `AI-generated fix: ${p.operation || 'replace'} in ${p.file}`,
          }));
          approach = `[Attempt ${attempt} - AI-Revised]: ${suggestedApproach || 'Reflection-generated patches'}`;
          
          // Create a spec from the revised patches
          const affectedFiles = [...new Set(patchesToApply.map(p => p.file))];
          validatedSpec = {
            findingId,
            title: `Fix: ${finding.title?.substring(0, 100) || 'Unknown issue'}`,
            approach,
            patches: patchesToApply,
            affectedFiles,
            rollbackPlan: 'Git revert to previous commit',
            riskLevel: 'medium',
            confidence: 0.75,
            requiresApproval: false,
            estimatedImpact: `AI-revised fix modifies ${affectedFiles.length} file(s)`,
          };
        } else {
          // First attempt or no revised patches - generate fresh spec
          const baseSpec = await this.generateFixSpecification(findingId);
          if (!baseSpec) {
            return { success: false, patches: [] };
          }
          
          // For retries without revised patches, incorporate approach guidance
          if (suggestedApproach && attempt > 1) {
            baseSpec.approach = `[Attempt ${attempt} - Reflection-guided]: ${suggestedApproach}\n\nOriginal: ${baseSpec.approach}`;
            log.info(`[AutonomousFix] Attempt ${attempt} using reflection guidance: ${suggestedApproach.substring(0, 100)}...`);
          }
          
          patchesToApply = baseSpec.patches;
          approach = baseSpec.approach;
          validatedSpec = baseSpec;
        }
        
        // Apply patches (without commit)
        const operationId = `autofix_${findingId}_attempt${attempt}_${Date.now()}`;
        lastOperationId = operationId;
        
        const patchResult = await trinityCodeOps.applyPatch({
          operationId,
          workspaceId: 'system',
          userId: 'trinity',
          patches: patchesToApply,
          autoCommit: false,
          reasoning: approach,
        });
        
        return { success: patchResult.success, patches: patchesToApply };
      },
      readFileContents
    );
    
    if (!iterationResult.success) {
      // All retries exhausted - escalate to human with diagnosis
      const diagnosis = iterationResult.finalResult?.diagnosis || 'Unknown failure after retries';
      const reflectionSummary = `After ${iterationResult.attempts.length} attempts, Trinity could not produce a clean fix.\n\nDiagnosis: ${diagnosis}`;
      
      log.info(`[AutonomousFix] Iterative fix failed - escalating to human`);
      
      // Rollback any remaining changes
      if (lastOperationId) {
        await trinityCodeOps.rollbackOperation(lastOperationId);
      }
      
      return {
        success: false,
        findingId,
        specificationId: '',
        validationPassed: false,
        validationErrors: iterationResult.attempts.flatMap(a => a.errors),
        rollbackAvailable: false,
        message: `Fix failed after ${iterationResult.attempts.length} attempts. ${diagnosis}`,
        reflectionSummary,
      };
    }
    
    // Fix passed internal validation - use the validated spec (don't regenerate!)
    log.info(`[AutonomousFix] Iterative fix succeeded on attempt ${iterationResult.attempts.length}`);
    
    if (!validatedSpec) {
      return {
        success: false,
        findingId,
        specificationId: '',
        validationPassed: true,
        validationErrors: [],
        rollbackAvailable: false,
        message: 'Internal validation passed but no spec was captured',
      };
    }
    
    // Run internal approval gate (validates code is still clean)
    const internalApproval = await this.runInternalApprovalGate(findingId, validatedSpec.affectedFiles);
    if (!internalApproval.approved) {
      log.info(`[AutonomousFix] Internal approval gate rejected: ${internalApproval.reason}`);
      if (lastOperationId) {
        await trinityCodeOps.rollbackOperation(lastOperationId);
      }
      return {
        success: false,
        findingId,
        specificationId: `spec_${findingId}`,
        validationPassed: false,
        validationErrors: [internalApproval.reason],
        rollbackAvailable: false,
        message: `Internal approval gate failed: ${internalApproval.reason}`,
      };
    }
    
    log.info(`[AutonomousFix] Internal approval gate passed - proceeding to commit/propose`);
    
    // Code is already applied and validated - now commit directly
    const commitResult = await trinityCodeOps.commitChanges({
      workspaceId: 'system',
      userId: 'trinity',
      files: validatedSpec.affectedFiles,
      message: `[Trinity AutoFix] ${validatedSpec.title}\n\nApproach: ${validatedSpec.approach.substring(0, 200)}...\nConfidence: ${(validatedSpec.confidence * 100).toFixed(0)}%\nAttempts: ${iterationResult.attempts.length}`,
      author: this.config.commitAuthor,
    });
    
    // Mark finding as resolved
    await gapIntelligenceService.markFindingResolved(findingId, 'Trinity:AutoFixWithReflection');
    
    // Emit success event
    await this.emitFixEvent('fix_applied', validatedSpec, commitResult.commitHash);
    
    // Restart workflows if needed
    if (this.config.autoRestartWorkflows) {
      await this.restartWorkflows();
    }
    
    return {
      success: true,
      findingId,
      specificationId: `spec_${findingId}`,
      validationPassed: true,
      validationErrors: [],
      commitHash: commitResult.commitHash,
      rollbackAvailable: true,
      message: `Fix applied successfully after ${iterationResult.attempts.length} attempt(s)${commitResult.commitHash ? ` (commit: ${commitResult.commitHash.substring(0, 7)})` : ''}`,
      reflectionSummary: iterationResult.attempts.length > 1 
        ? `Required ${iterationResult.attempts.length} attempts with reflection-guided corrections`
        : undefined,
    };
  }

  /**
   * Internal approval gate - validates fix before proposing to user
   * Only clean fixes should reach the user approval queue
   */
  async runInternalApprovalGate(
    findingId: string,
    affectedFiles: string[]
  ): Promise<{ approved: boolean; reason: string }> {
    return trinityReflectionEngine.validateBeforeProposal(findingId, affectedFiles);
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate changes before committing
   */
  async validateChanges(affectedFiles: string[]): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // TypeScript check
      try {
        await execAsync('npx tsc --noEmit', {
          cwd: this.projectRoot,
          timeout: this.config.validationTimeout,
        });
      } catch (tscError: any) {
        const output = (tscError.stdout || '') + (tscError.stderr || '');
        
        // Check if new errors were introduced in our files
        for (const file of affectedFiles) {
          if (output.includes(file)) {
            errors.push(`TypeScript error in ${file}`);
          }
        }
      }

      // Syntax check for each file
      for (const file of affectedFiles) {
        const filePath = path.resolve(this.projectRoot, file);
        if (!fs.existsSync(filePath)) continue;

        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          try {
            await execAsync(`npx tsc --noEmit "${filePath}"`, {
              cwd: this.projectRoot,
              timeout: 30000,
            });
          } catch (e: any) {
            if (!errors.some(err => err.includes(file))) {
              errors.push(`Syntax error in ${file}`);
            }
          }
        }
      }

      return {
        passed: errors.length === 0,
        errors,
      };
    } catch (error: any) {
      log.error('[AutonomousFix] Validation error:', error);
      return {
        passed: false,
        errors: [`Validation failed: ${(error instanceof Error ? error.message : String(error))}`],
      };
    }
  }

  // ==========================================================================
  // WORKFLOW RESTART
  // ==========================================================================

  /**
   * Restart affected workflows after fix
   */
  async restartWorkflows(): Promise<boolean> {
    if (!this.config.autoRestartWorkflows) {
      log.info('[AutonomousFix] Auto-restart disabled');
      return false;
    }

    try {
      // Touch a file to trigger Replit's auto-restart
      const touchPath = path.resolve(this.projectRoot, '.trigger-restart');
      fs.writeFileSync(touchPath, new Date().toISOString());
      
      setTimeout(() => {
        if (fs.existsSync(touchPath)) {
          fs.unlinkSync(touchPath);
        }
      }, 5000);

      log.info('[AutonomousFix] Triggered workflow restart');
      return true;
    } catch (error) {
      log.error('[AutonomousFix] Failed to restart workflows:', error);
      return false;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private assessRiskLevel(finding: any, patches: PatchOperation[]): 'low' | 'medium' | 'high' | 'critical' {
    // Critical files
    const criticalPatterns = ['schema.ts', 'auth', 'payment', 'stripe', 'db.ts', 'index.ts'];
    const hasCriticalFile = patches.some(p => 
      criticalPatterns.some(pattern => p.file.toLowerCase().includes(pattern))
    );
    if (hasCriticalFile) return 'critical';

    // Many files = high risk
    if (patches.length > 5) return 'high';

    // Deletion is higher risk
    if (patches.some(p => p.type === 'delete')) return 'medium';

    // Single file, simple change
    if (patches.length === 1 && patches[0].type === 'replace') return 'low';

    return 'medium';
  }

  private async emitFixEvent(eventType: string, spec: FixSpecification, commitHash?: string): Promise<void> {
    // Map internal event types to valid PlatformEventType
    const eventTypeMap: Record<string, string> = {
      'fix_applied': 'fix_applied',
      'fix_validated': 'fix_validated',
      'fix_escalated': 'fix_escalated',
      'fix_exhausted': 'fix_exhausted',
    };
    
    const mappedType = eventTypeMap[eventType] || 'automation_completed';
    
    const event: PlatformEvent = {
      type: mappedType as PlatformEvent['type'],
      category: 'automation',
      title: `AutoFix: ${spec.title}`,
      description: `Applied ${spec.patches.length} patch(es) to ${spec.affectedFiles.length} file(s)`,
      metadata: {
        findingId: spec.findingId,
        confidence: spec.confidence,
        riskLevel: spec.riskLevel,
        commitHash,
        affectedFiles: spec.affectedFiles,
        timestamp: new Date().toISOString(),
      },
      visibility: 'org_leadership',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      log.error('[AutonomousFix] Failed to emit event:', error);
    }
  }

  getActiveFixes(): Map<string, { status: string; startedAt: Date }> {
    return this.activeFixes;
  }

  // ==========================================================================
  // AUTONOMOUS SELF-HEALING - Process Outstanding Findings
  // ==========================================================================

  /**
   * Process outstanding gap findings automatically.
   * This is Trinity's self-healing loop - no human intervention needed.
   * Guardrails (hotpatch cadence, confidence threshold) prevent platform breakage.
   */
  async processOutstandingFindings(): Promise<{ processed: number; fixed: number; skipped: number; errors: string[] }> {
    const results = { processed: 0, fixed: 0, skipped: 0, errors: [] as string[] };

    try {
      // Fetch unresolved high-confidence findings (errors/criticals first)
      const findings = await db
        .select()
        .from(aiGapFindings)
        .where(
          and(
            eq(aiGapFindings.status, 'open'),
            gte(aiGapFindings.detectionConfidence, String(this.config.autoApproveThreshold))
          )
        )
        .orderBy(
          sql`CASE WHEN ${aiGapFindings.severity} = 'critical' THEN 1 
                   WHEN ${aiGapFindings.severity} = 'error' THEN 2 
                   WHEN ${aiGapFindings.severity} = 'warning' THEN 3 
                   ELSE 4 END`,
          desc(aiGapFindings.createdAt)
        )
        .limit(10);

      if (findings.length === 0) {
        log.info('[AutonomousFix] No high-confidence findings to process');
        return results;
      }

      log.info(`[AutonomousFix] Processing ${findings.length} outstanding findings (confidence >= ${this.config.autoApproveThreshold})`);

      for (const finding of findings) {
        results.processed++;

        try {
          // Skip if we're at max concurrent fixes
          if (this.activeFixes.size >= this.config.maxConcurrentFixes) {
            log.info(`[AutonomousFix] Max concurrent fixes reached, queuing remaining`);
            results.skipped += findings.length - results.processed + 1;
            break;
          }

          // Generate fix specification
          const spec = await this.generateFixSpecification(finding.id);
          if (!spec) {
            log.info(`[AutonomousFix] Could not generate spec for finding ${finding.id}`);
            results.skipped++;
            continue;
          }

          // Auto-approve if confidence meets threshold and risk is acceptable
          const canAutoApprove = spec.confidence >= this.config.autoApproveThreshold && 
                                  (spec.riskLevel === 'low' || spec.riskLevel === 'medium');

          if (!canAutoApprove) {
            log.info(`[AutonomousFix] Finding ${finding.id} requires human approval (risk: ${spec.riskLevel}, confidence: ${spec.confidence})`);
            results.skipped++;
            continue;
          }

          // Execute fix with reflection for self-correction
          log.info(`[AutonomousFix] Auto-executing fix for finding ${finding.id}: ${spec.title}`);
          const result = await this.executeFixWithReflection(finding.id, { 
            maxRetries: 2, 
            skipUserProposal: true 
          });

          if (result.success) {
            results.fixed++;
            log.info(`[AutonomousFix] Successfully fixed: ${finding.title}`);
            
            // Mark finding as resolved
            await db
              .update(aiGapFindings)
              .set({ status: 'fixed', fixedAt: new Date() })
              .where(eq(aiGapFindings.id, finding.id));
          } else {
            results.errors.push(`${finding.id}: ${result.message}`);
            log.error(`[AutonomousFix] Failed to fix ${finding.id}: ${result.message}`);
          }
        } catch (error: any) {
          results.errors.push(`${finding.id}: ${(error instanceof Error ? error.message : String(error))}`);
          log.error(`[AutonomousFix] Error processing finding ${finding.id}:`, error);
        }
      }

      log.info(`[AutonomousFix] Self-healing complete: ${results.fixed}/${results.processed} fixed, ${results.skipped} skipped`);
      
      // Emit self-healing summary event
      await platformEventBus.publish({
        type: 'automation_completed',
        category: 'automation',
        title: 'Trinity Self-Healing Cycle Complete',
        description: `Processed ${results.processed} findings: ${results.fixed} fixed, ${results.skipped} skipped, ${results.errors.length} errors`,
        metadata: results,
        visibility: 'org_leadership',
      });

      return results;
    } catch (error: any) {
      log.error('[AutonomousFix] Error in processOutstandingFindings:', error);
      results.errors.push((error instanceof Error ? error.message : String(error)));
      return results;
    }
  }

  // ==========================================================================
  // AI BRAIN ACTIONS
  // ==========================================================================

  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'autofix.generate_spec', name: 'Generate Fix Spec', desc: 'Generate a fix specification from a gap finding', fn: (p: any) => self.generateFixSpecification(p.findingId) },
      { id: 'autofix.execute', name: 'Execute Fix', desc: 'Generate and execute a fix for a gap finding', 
        fn: async (p: any) => {
          const spec = await self.generateFixSpecification(p.findingId);
          if (!spec) return { success: false, message: 'Could not generate fix specification' };
          return self.executeFix(spec, { dryRun: p.dryRun, skipApproval: p.skipApproval, autoCommit: p.autoCommit });
        } 
      },
      { id: 'autofix.execute_with_reflection', name: 'Execute With Reflection', 
        desc: 'Execute fix with iterative self-correction using Agent-Architect pattern (up to 3 retries)', 
        fn: (p: any) => self.executeFixWithReflection(p.findingId, { maxRetries: p.maxRetries, skipUserProposal: p.skipUserProposal }) 
      },
      { id: 'autofix.execute_approved', name: 'Execute Approved', desc: 'Execute a fix that has been approved', fn: (p: any) => self.executeApprovedFix(p.approvalId) },
      { id: 'autofix.internal_approval_gate', name: 'Internal Approval Gate', desc: 'Validate fix before proposing to user', fn: (p: any) => self.runInternalApprovalGate(p.findingId, p.affectedFiles || []) },
      { id: 'autofix.validate', name: 'Validate Changes', desc: 'Validate changes in specified files', fn: (p: any) => self.validateChanges(p.files || []) },
      { id: 'autofix.restart_workflows', name: 'Restart Workflows', desc: 'Trigger workflow restart after fixes', fn: () => self.restartWorkflows() },
      { id: 'autofix.get_active', name: 'Get Active Fixes', desc: 'Get currently active fix operations', 
        fn: () => Array.from(self.getActiveFixes().entries()).map(([id, info]) => ({ findingId: id, ...info })) 
      },
      { id: 'autofix.self_heal', name: 'Self-Heal Platform', 
        desc: 'Process all outstanding high-confidence findings and auto-fix them (Trinity autonomous self-healing)', 
        fn: () => self.processOutstandingFindings() 
      },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'automation',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request: any) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return {
            success: true,
            actionId: request.actionId,
            message: `${action.name} completed`,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });
    }

    log.info('[AutonomousFix] Registered 9 AI Brain actions (includes self-heal, reflection & internal approval gate)');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const autonomousFixPipeline = AutonomousFixPipelineService.getInstance();

export async function initializeAutonomousFixPipeline(): Promise<void> {
  log.info('[AutonomousFix] Initializing Autonomous Fix Pipeline...');
  autonomousFixPipeline.registerActions();
  
  // Subscribe to approval_approved events to automatically execute fixes
  platformEventBus.subscribe('approval_approved', { name: 'AutonomousFix-ApprovalExecutor', handler: async (event: PlatformEvent) => {
    const approvalId = event.metadata?.approvalId;
    if (approvalId) {
      log.info(`[AutonomousFix] Received approval_approved for ${approvalId} - auto-executing fix...`);
      try {
        const result = await autonomousFixPipeline.executeApprovedFix(approvalId);
        if (result.success) {
          log.info(`[AutonomousFix] Successfully executed approved fix: ${result.message}`);
        } else {
          log.error(`[AutonomousFix] Failed to execute approved fix: ${result.message}`);
        }
      } catch (error) {
        log.error('[AutonomousFix] Error auto-executing approved fix:', error);
      }
    }
  }});
  log.info('[AutonomousFix] Subscribed to approval_approved events for auto-execution');
  
  // Subscribe to gap_intelligence_scan events to auto-process findings
  platformEventBus.subscribe('gap_intelligence_scan', { name: 'AutonomousFix-GapProcessor', handler: async (event: PlatformEvent) => {
    const { newFindings, errorCount, criticalCount } = event.metadata || {};
    
    if (newFindings > 0 && (errorCount > 0 || criticalCount > 0)) {
      log.info(`[AutonomousFix] Gap Intelligence detected ${newFindings} new issues (${criticalCount} critical, ${errorCount} errors) - auto-processing...`);
      
      try {
        // Process outstanding high-confidence findings
        await autonomousFixPipeline.processOutstandingFindings();
      } catch (error) {
        log.error('[AutonomousFix] Error auto-processing gap findings:', error);
      }
    }
  }});
  log.info('[AutonomousFix] Subscribed to gap_intelligence_scan events for self-healing');
  
  // Schedule periodic self-healing (every hour at :45)
  // This catches any findings that might have been missed by event-based triggering
  cron.schedule('45 * * * *', async () => {
    log.info('[AutonomousFix] Running scheduled self-healing cycle...');
    try {
      const results = await autonomousFixPipeline.processOutstandingFindings();
      if (results.fixed > 0) {
        log.info(`[AutonomousFix] Scheduled self-healing: Fixed ${results.fixed} issues`);
      }
    } catch (error) {
      log.error('[AutonomousFix] Scheduled self-healing error:', error);
    }
  });
  log.info('[AutonomousFix] Scheduled hourly self-healing job (at :45)');
  
  log.info('[AutonomousFix] Autonomous Fix Pipeline initialized');
}

export { AutonomousFixPipelineService };
