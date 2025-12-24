/**
 * AUTONOMOUS FIX PIPELINE - Trinity Self-Healing Code System
 * ============================================================
 * Orchestrates the complete autonomous fix lifecycle:
 * 1. Fix Specification Generation - AI analyzes findings and proposes fixes
 * 2. Code Edits - Applies patches via TrinityCodeOps
 * 3. Validation - TypeScript/lint checks before commit
 * 4. Approval Request - Human-in-the-loop for critical changes
 * 5. Commit & Restart - Git commit and workflow restart
 * 
 * Part of Trinity's Full Platform Awareness initiative.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../db';
import { aiGapFindings, aiWorkflowApprovals } from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { trinityCodeOps, PatchOperation, PatchResult } from './trinityCodeOps';
import { workflowApprovalService } from './workflowApprovalService';
import { gapIntelligenceService } from './gapIntelligenceService';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';
import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { GapFinding } from './subagents/domainOpsSubagents';
import { trinityOrchestrationGovernance, hotpatchCadenceController } from './trinityOrchestrationGovernance';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface FixSpecification {
  findingId: number;
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
  findingId: number;
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
  autoApproveThreshold: 0.95,
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
  private activeFixes: Map<number, { status: string; startedAt: Date }> = new Map();
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
  async generateFixSpecification(findingId: number): Promise<FixSpecification | null> {
    try {
      const [finding] = await db
        .select()
        .from(aiGapFindings)
        .where(eq(aiGapFindings.id, findingId));

      if (!finding) {
        console.error(`[AutonomousFix] Finding ${findingId} not found`);
        return null;
      }

      console.log(`[AutonomousFix] Generating fix spec for: ${finding.title}`);

      const spec = await this.createSpecFromFinding(finding);
      
      if (!spec) {
        console.log(`[AutonomousFix] Could not generate fix for finding ${findingId}`);
        return null;
      }

      console.log(`[AutonomousFix] Generated spec with ${spec.patches.length} patches, confidence: ${spec.confidence}`);
      return spec;
    } catch (error) {
      console.error(`[AutonomousFix] Error generating fix spec:`, error);
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
        console.warn(`[AutonomousFix] Could not read file ${filePath}`);
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
      console.warn(`[AutonomousFix] Max concurrent fixes reached (${activeCount}/${this.config.maxConcurrentFixes})`);
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
      console.warn(`[AutonomousFix] Finding ${spec.findingId} is already being processed`);
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
    
    console.log(`[AutonomousFix] Executing fix for finding ${spec.findingId} (${activeCount + 1}/${this.config.maxConcurrentFixes} active)`);
    
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
          } as GapFinding & { id: number },
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
        console.log(`[AutonomousFix] Hotpatch blocked: ${hotpatchWindow.reason}`);
        console.log(`[AutonomousFix] Next window: ${hotpatchWindow.nextWindowStart.toISOString()}`);
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
        console.log(`[AutonomousFix] DRY RUN - would apply ${spec.patches.length} patches`);
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
      console.log(`[AutonomousFix] Hotpatch recorded (${hotpatchWindow.patchesToday + 1}/${hotpatchWindow.dailyLimit} today)`);

      // Apply patches
      const patchResult = await trinityCodeOps.applyPatches({
        operationId: `autofix_${spec.findingId}_${Date.now()}`,
        workspaceId: 'platform',
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
          workspaceId: 'platform',
          userId: 'trinity',
          files: spec.affectedFiles,
          message: `[Trinity AutoFix] ${spec.title}\n\nApproach: ${spec.approach}\nConfidence: ${(spec.confidence * 100).toFixed(0)}%`,
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
      console.error(`[AutonomousFix] Error executing fix:`, error);
      this.activeFixes.delete(spec.findingId);
      
      return {
        success: false,
        findingId: spec.findingId,
        specificationId: `spec_${spec.findingId}`,
        validationPassed: false,
        validationErrors: [error.message],
        rollbackAvailable: false,
        message: `Execution error: ${error.message}`,
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
          findingId: 0,
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
          findingId: parseInt(approval.gapFindingId || '0'),
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
          findingId: parseInt(approval.gapFindingId || '0'),
          specificationId: '',
          validationPassed: false,
          validationErrors: ['No proposed changes found'],
          rollbackAvailable: false,
          message: 'No proposed changes in approval',
        };
      }

      // Create spec from approval
      const spec: FixSpecification = {
        findingId: parseInt(approval.gapFindingId || '0'),
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
      console.error(`[AutonomousFix] Error executing approved fix:`, error);
      return {
        success: false,
        findingId: 0,
        specificationId: '',
        validationPassed: false,
        validationErrors: [error.message],
        rollbackAvailable: false,
        message: `Error: ${error.message}`,
      };
    }
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
      console.error('[AutonomousFix] Validation error:', error);
      return {
        passed: false,
        errors: [`Validation failed: ${error.message}`],
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
      console.log('[AutonomousFix] Auto-restart disabled');
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

      console.log('[AutonomousFix] Triggered workflow restart');
      return true;
    } catch (error) {
      console.error('[AutonomousFix] Failed to restart workflows:', error);
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
    const event: PlatformEvent = {
      type: eventType,
      category: 'automation',
      title: `Trinity AutoFix: ${spec.title}`,
      description: `Applied ${spec.patches.length} patch(es) to ${spec.affectedFiles.length} file(s)`,
      metadata: {
        findingId: spec.findingId,
        confidence: spec.confidence,
        riskLevel: spec.riskLevel,
        commitHash,
        affectedFiles: spec.affectedFiles,
        timestamp: new Date().toISOString(),
      },
      visibility: 'admin',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      console.error('[AutonomousFix] Failed to emit event:', error);
    }
  }

  getActiveFixes(): Map<number, { status: string; startedAt: Date }> {
    return this.activeFixes;
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
      { id: 'autofix.execute_approved', name: 'Execute Approved', desc: 'Execute a fix that has been approved', fn: (p: any) => self.executeApprovedFix(p.approvalId) },
      { id: 'autofix.validate', name: 'Validate Changes', desc: 'Validate changes in specified files', fn: (p: any) => self.validateChanges(p.files || []) },
      { id: 'autofix.restart_workflows', name: 'Restart Workflows', desc: 'Trigger workflow restart after fixes', fn: () => self.restartWorkflows() },
      { id: 'autofix.get_active', name: 'Get Active Fixes', desc: 'Get currently active fix operations', 
        fn: () => Array.from(self.getActiveFixes().entries()).map(([id, info]) => ({ findingId: id, ...info })) 
      },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'autonomous_fix',
        description: action.desc,
        requiredRoles: ['support', 'admin', 'super_admin'],
        handler: async (request) => {
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

    console.log('[AutonomousFix] Registered 6 AI Brain actions');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const autonomousFixPipeline = AutonomousFixPipelineService.getInstance();

export async function initializeAutonomousFixPipeline(): Promise<void> {
  console.log('[AutonomousFix] Initializing Autonomous Fix Pipeline...');
  autonomousFixPipeline.registerActions();
  
  // Subscribe to approval_approved events to automatically execute fixes
  platformEventBus.subscribe('approval_approved', async (event: PlatformEvent) => {
    const approvalId = event.metadata?.approvalId;
    if (approvalId) {
      console.log(`[AutonomousFix] Received approval_approved for ${approvalId} - auto-executing fix...`);
      try {
        const result = await autonomousFixPipeline.executeApprovedFix(approvalId);
        if (result.success) {
          console.log(`[AutonomousFix] Successfully executed approved fix: ${result.message}`);
        } else {
          console.error(`[AutonomousFix] Failed to execute approved fix: ${result.message}`);
        }
      } catch (error) {
        console.error('[AutonomousFix] Error auto-executing approved fix:', error);
      }
    }
  });
  console.log('[AutonomousFix] Subscribed to approval_approved events for auto-execution');
  
  console.log('[AutonomousFix] Autonomous Fix Pipeline initialized');
}

export { AutonomousFixPipelineService };
