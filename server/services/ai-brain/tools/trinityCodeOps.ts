/**
 * TRINITY CODE OPS - Autonomous Coding Toolkit
 * =============================================
 * Fortune 500-grade file manipulation and code editing capabilities for Trinity.
 * Enables grep, patch, commit, and intelligent code search operations.
 * 
 * Features:
 * - Code Search: Regex-based grep with context extraction
 * - Patch Application: Structured diff-based file editing
 * - Git Operations: Commit, diff preview, and branch management
 * - Approval Workflow: Human-in-the-loop for critical changes
 * - Audit Trail: Complete logging of all file operations
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../db';
import { automationActionLedger, systemAuditLogs } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCodeOps');

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context: {
    before: string[];
    after: string[];
  };
  relativePath: string;
}

export interface CodeSearchRequest {
  pattern: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  filePattern?: string;
  directory?: string;
  contextLines?: number;
  maxResults?: number;
  excludePatterns?: string[];
}

export interface CodeSearchResponse {
  success: boolean;
  query: string;
  results: SearchResult[];
  totalMatches: number;
  searchTimeMs: number;
  truncated: boolean;
}

export interface PatchOperation {
  type: 'insert' | 'delete' | 'replace';
  file: string;
  startLine?: number;
  endLine?: number;
  oldContent?: string;
  newContent?: string;
  description: string;
}

export interface PatchRequest {
  operationId: string;
  workspaceId: string;
  userId: string;
  patches: PatchOperation[];
  commitMessage?: string;
  autoCommit?: boolean;
  requiresApproval?: boolean;
  reasoning?: string;
}

export interface PatchResult {
  success: boolean;
  operationId: string;
  appliedPatches: number;
  failedPatches: number;
  errors: string[];
  diffPreview: string;
  commitHash?: string;
  rollbackAvailable: boolean;
}

export interface GitCommitRequest {
  workspaceId: string;
  userId: string;
  files: string[];
  message: string;
  author?: string;
  coAuthors?: string[];
}

export interface GitCommitResult {
  success: boolean;
  commitHash?: string;
  branch?: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  error?: string;
}

export interface DiffPreview {
  file: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface ApprovalRequest {
  id: string;
  operationId: string;
  workspaceId: string;
  userId: string;
  type: 'patch' | 'commit' | 'delete';
  description: string;
  diffPreview: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

// ============================================================================
// TRINITY CODE OPS SERVICE
// ============================================================================

class TrinityCodeOpsService {
  private static instance: TrinityCodeOpsService;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private operationHistory: Map<string, { patches: PatchOperation[]; originalContent: Map<string, string> }> = new Map();
  private projectRoot: string;

  private constructor() {
    this.projectRoot = process.cwd();
  }

  static getInstance(): TrinityCodeOpsService {
    if (!TrinityCodeOpsService.instance) {
      TrinityCodeOpsService.instance = new TrinityCodeOpsService();
    }
    return TrinityCodeOpsService.instance;
  }

  // ---------------------------------------------------------------------------
  // CODE SEARCH (GREP-LIKE)
  // ---------------------------------------------------------------------------
  
  async searchCode(request: CodeSearchRequest): Promise<CodeSearchResponse> {
    const startTime = Date.now();
    const results: SearchResult[] = [];
    
    try {
      const {
        pattern,
        isRegex = false,
        caseSensitive = false,
        filePattern = '*',
        directory = '.',
        contextLines = 3,
        maxResults = 100,
        excludePatterns = ['node_modules', '.git', 'dist', 'build', '.next']
      } = request;

      // Build grep command
      const flags = ['-rn'];
      if (!caseSensitive) flags.push('-i');
      if (isRegex) flags.push('-E');
      
      // Add context
      if (contextLines > 0) {
        flags.push(`-B${contextLines}`);
        flags.push(`-A${contextLines}`);
      }

      // Exclude patterns
      const excludeArgs = excludePatterns.map(p => `--exclude-dir=${p}`).join(' ');
      
      // Include file pattern
      const includeArg = filePattern !== '*' ? `--include="${filePattern}"` : '';

      const searchDir = path.resolve(this.projectRoot, directory);
      const escapedPattern = pattern.replace(/"/g, '\\"');
      
      const cmd = `grep ${flags.join(' ')} ${excludeArgs} ${includeArg} "${escapedPattern}" "${searchDir}" 2>/dev/null || true`;

      const { stdout } = await execAsync(cmd, { 
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000
      });

      // Parse grep output
      const lines = stdout.split('\n').filter(Boolean);
      let currentFile = '';
      let currentContext: { before: string[]; after: string[] } = { before: [], after: [] };
      let matchLine = 0;
      let matchContent = '';
      let inBeforeContext = false;
      let inAfterContext = false;
      let afterCount = 0;

      for (const line of lines) {
        if (results.length >= maxResults) break;

        // Parse line format: filename:linenum:content or filename-linenum-content (context)
        const matchResult = line.match(/^(.+?)[:\-](\d+)[:\-](.*)$/);
        if (!matchResult) continue;

        const [, file, lineNum, content] = matchResult;
        const isMatch = line.includes(':') && !line.startsWith('-');
        const lineNumber = parseInt(lineNum, 10);

        if (isMatch) {
          // If we have a pending result, save it
          if (currentFile && matchContent) {
            results.push({
              file: currentFile,
              line: matchLine,
              column: matchContent.toLowerCase().indexOf(pattern.toLowerCase()) + 1,
              match: matchContent,
              context: { ...currentContext },
              relativePath: path.relative(this.projectRoot, currentFile)
            });
          }

          currentFile = file;
          matchLine = lineNumber;
          matchContent = content;
          currentContext = { before: [], after: [] };
          inBeforeContext = false;
          inAfterContext = true;
          afterCount = 0;
        } else if (currentFile === file) {
          if (lineNumber < matchLine) {
            currentContext.before.push(content);
          } else if (lineNumber > matchLine) {
            currentContext.after.push(content);
            afterCount++;
            if (afterCount >= contextLines) {
              inAfterContext = false;
            }
          }
        }
      }

      // Save last result
      if (currentFile && matchContent && results.length < maxResults) {
        results.push({
          file: currentFile,
          line: matchLine,
          column: matchContent.toLowerCase().indexOf(pattern.toLowerCase()) + 1,
          match: matchContent,
          context: currentContext,
          relativePath: path.relative(this.projectRoot, currentFile)
        });
      }

      const searchTimeMs = Date.now() - startTime;

      // Log the search operation
      await this.logOperation('code_search', {
        pattern,
        resultsCount: results.length,
        searchTimeMs
      });

      return {
        success: true,
        query: pattern,
        results,
        totalMatches: results.length,
        searchTimeMs,
        truncated: lines.length > maxResults
      };

    } catch (error: any) {
      log.error('[TrinityCodeOps] Search error:', (error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        query: request.pattern,
        results: [],
        totalMatches: 0,
        searchTimeMs: Date.now() - startTime,
        truncated: false
      };
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH APPLICATION (STRUCTURED FILE EDITING)
  // ---------------------------------------------------------------------------

  async applyPatch(request: PatchRequest): Promise<PatchResult> {
    const { operationId, workspaceId, userId, patches, commitMessage, autoCommit = false, requiresApproval = true, reasoning } = request;
    
    log.info(`[TrinityCodeOps] Applying ${patches.length} patches, operation: ${operationId}`);

    // Store original content for rollback
    const originalContent = new Map<string, string>();
    const errors: string[] = [];
    let appliedPatches = 0;
    let failedPatches = 0;

    try {
      // Pre-flight: Read all original files
      for (const patch of patches) {
        const filePath = path.resolve(this.projectRoot, patch.file);
        if (fs.existsSync(filePath)) {
          originalContent.set(patch.file, fs.readFileSync(filePath, 'utf-8'));
        } else if (patch.type !== 'insert') {
          errors.push(`File not found: ${patch.file}`);
          failedPatches++;
        }
      }

      // Generate diff preview before applying
      const diffPreview = await this.generateDiffPreview(patches, originalContent);

      // Check if approval is required
      if (requiresApproval) {
        const riskLevel = this.assessRiskLevel(patches);
        
        if (riskLevel === 'high' || riskLevel === 'critical') {
          const approval = await this.createApprovalRequest({
            operationId,
            workspaceId,
            userId,
            type: 'patch',
            description: reasoning || `Apply ${patches.length} code patches`,
            diffPreview,
            riskLevel
          });

          // Emit event for approval notification
          platformEventBus.publish({
            type: 'automation_completed' as any,
            category: 'ai_brain',
            title: 'Code Change Approval Required',
            description: `${patches.length} patches require approval (Risk: ${riskLevel})`,
            metadata: { approvalId: approval.id, operationId, workspaceId, riskLevel, patchCount: patches.length },
            severity: riskLevel === 'critical' ? 'error' : 'warning',
            isNew: true
          }).catch((err) => log.warn('[trinityCodeOps] Fire-and-forget failed:', err));

          return {
            success: false,
            operationId,
            appliedPatches: 0,
            failedPatches: 0,
            errors: [`Approval required. Approval ID: ${approval.id}`],
            diffPreview,
            rollbackAvailable: false
          };
        }
      }

      // Apply patches
      for (const patch of patches) {
        try {
          await this.applySinglePatch(patch, originalContent);
          appliedPatches++;
        } catch (err: any) {
          errors.push(`Failed to apply patch to ${patch.file}: ${(err instanceof Error ? err.message : String(err))}`);
          failedPatches++;
        }
      }

      // Store for rollback
      this.operationHistory.set(operationId, { patches, originalContent });

      // Auto-commit if requested
      let commitHash: string | undefined;
      if (autoCommit && commitMessage && appliedPatches > 0) {
        const commitResult = await this.commitChanges({
          workspaceId,
          userId,
          files: patches.map(p => p.file),
          message: commitMessage,
          author: 'Trinity AI <trinity@coaileague.ai>'
        });
        commitHash = commitResult.commitHash;
      }

      // Log the operation
      await this.logOperation('patch_applied', {
        operationId,
        appliedPatches,
        failedPatches,
        commitHash
      });

      // Emit success event
      platformEventBus.publish({
        type: 'automation_completed' as any,
        category: 'ai_brain',
        title: 'Code Patches Applied',
        description: `Applied ${appliedPatches} patches successfully`,
        metadata: { operationId, workspaceId, appliedPatches, commitHash },
        severity: 'info',
        isNew: true
      }).catch((err) => log.warn('[trinityCodeOps] Fire-and-forget failed:', err));

      return {
        success: failedPatches === 0,
        operationId,
        appliedPatches,
        failedPatches,
        errors,
        diffPreview,
        commitHash,
        rollbackAvailable: true
      };

    } catch (error: any) {
      log.error('[TrinityCodeOps] Patch application error:', error);
      
      // Attempt rollback on catastrophic failure
      if (appliedPatches > 0) {
        await this.rollbackOperation(operationId);
      }

      return {
        success: false,
        operationId,
        appliedPatches: 0,
        failedPatches: patches.length,
        errors: [(error instanceof Error ? error.message : String(error))],
        diffPreview: '',
        rollbackAvailable: false
      };
    }
  }

  private async applySinglePatch(patch: PatchOperation, originalContent: Map<string, string>): Promise<void> {
    const filePath = path.resolve(this.projectRoot, patch.file);

    switch (patch.type) {
      case 'insert': {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, patch.newContent || '', 'utf-8');
        break;
      }

      case 'delete': {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        break;
      }

      case 'replace': {
        const content = originalContent.get(patch.file) || fs.readFileSync(filePath, 'utf-8');
        
        if (patch.oldContent && patch.newContent) {
          // String replacement
          const newContent = content.replace(patch.oldContent, patch.newContent);
          if (newContent === content) {
            throw new Error(`Pattern not found in ${patch.file}`);
          }
          fs.writeFileSync(filePath, newContent, 'utf-8');
        } else if (patch.startLine !== undefined && patch.endLine !== undefined && patch.newContent !== undefined) {
          // Line-based replacement
          const lines = content.split('\n');
          const before = lines.slice(0, patch.startLine - 1);
          const after = lines.slice(patch.endLine);
          const newLines = [...before, patch.newContent, ...after];
          fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
        } else {
          throw new Error('Invalid replace patch: missing required fields');
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GIT OPERATIONS
  // ---------------------------------------------------------------------------

  async commitChanges(request: GitCommitRequest): Promise<GitCommitResult> {
    const { files, message, author, coAuthors } = request;

    try {
      // Stage files
      for (const file of files) {
        const filePath = path.resolve(this.projectRoot, file);
        if (fs.existsSync(filePath)) {
          await execAsync(`git add "${filePath}"`, { cwd: this.projectRoot });
        }
      }

      // Build commit message with co-authors
      let fullMessage = message;
      if (coAuthors && coAuthors.length > 0) {
        fullMessage += '\n\n' + coAuthors.map(a => `Co-authored-by: ${a}`).join('\n');
      }

      // Commit
      const authorArg = author ? `--author="${author}"` : '';
      const escapedMessage = fullMessage.replace(/"/g, '\\"');
      
      const { stdout } = await execAsync(
        `git commit ${authorArg} -m "${escapedMessage}" 2>&1 || true`,
        { cwd: this.projectRoot }
      );

      // Get commit hash
      const hashResult = await execAsync('git rev-parse HEAD', { cwd: this.projectRoot });
      const commitHash = hashResult.stdout.trim();

      // Get branch
      const branchResult = await execAsync('git branch --show-current', { cwd: this.projectRoot });
      const branch = branchResult.stdout.trim();

      // Get stats
      const statsMatch = stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      const filesChanged = statsMatch ? parseInt(statsMatch[1], 10) : files.length;
      const insertions = statsMatch && statsMatch[2] ? parseInt(statsMatch[2], 10) : 0;
      const deletions = statsMatch && statsMatch[3] ? parseInt(statsMatch[3], 10) : 0;

      // Log operation
      await this.logOperation('git_commit', {
        commitHash,
        branch,
        filesChanged,
        message
      });

      return {
        success: true,
        commitHash,
        branch,
        filesChanged,
        insertions,
        deletions
      };

    } catch (error: any) {
      log.error('[TrinityCodeOps] Git commit error:', error);
      return {
        success: false,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        error: (error instanceof Error ? error.message : String(error))
      };
    }
  }

  async getDiff(files?: string[]): Promise<string> {
    try {
      const fileArgs = files ? files.map(f => `"${f}"`).join(' ') : '';
      const { stdout } = await execAsync(
        `git diff --staged ${fileArgs} || git diff ${fileArgs}`,
        { cwd: this.projectRoot, maxBuffer: 5 * 1024 * 1024 }
      );
      return stdout;
    } catch (error: any) {
      log.error('[TrinityCodeOps] Git diff error:', error);
      return '';
    }
  }

  async getStatus(): Promise<{ modified: string[]; staged: string[]; untracked: string[] }> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: this.projectRoot });
      const lines = stdout.split('\n').filter(Boolean);
      
      const modified: string[] = [];
      const staged: string[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status.startsWith('?')) {
          untracked.push(file);
        } else if (status[0] !== ' ') {
          staged.push(file);
        } else {
          modified.push(file);
        }
      }

      return { modified, staged, untracked };
    } catch (error) {
      return { modified: [], staged: [], untracked: [] };
    }
  }

  // ---------------------------------------------------------------------------
  // ROLLBACK OPERATIONS
  // ---------------------------------------------------------------------------

  async rollbackOperation(operationId: string): Promise<boolean> {
    const history = this.operationHistory.get(operationId);
    if (!history) {
      log.warn(`[TrinityCodeOps] No history found for operation: ${operationId}`);
      return false;
    }

    try {
      // Restore original content
      for (const [file, content] of history.originalContent) {
        const filePath = path.resolve(this.projectRoot, file);
        fs.writeFileSync(filePath, content, 'utf-8');
      }

      // Clean up history
      this.operationHistory.delete(operationId);

      // Log rollback
      await this.logOperation('rollback', { operationId });

      platformEventBus.publish({
        type: 'automation_completed' as any,
        category: 'ai_brain',
        title: 'Rollback Completed',
        description: `Operation ${operationId} rolled back successfully`,
        metadata: { operationId },
        severity: 'info',
        isNew: true
      }).catch((err) => log.warn('[trinityCodeOps] Fire-and-forget failed:', err));

      return true;
    } catch (error: any) {
      log.error('[TrinityCodeOps] Rollback error:', error);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // APPROVAL WORKFLOW
  // ---------------------------------------------------------------------------

  private async createApprovalRequest(params: Omit<ApprovalRequest, 'id' | 'createdAt' | 'expiresAt' | 'status'>): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      ...params,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      status: 'pending'
    };

    this.pendingApprovals.set(approval.id, approval);
    return approval;
  }

  async approveRequest(approvalId: string, approverId: string): Promise<boolean> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) return false;

    approval.status = 'approved';
    
    await this.logOperation('approval_granted', {
      approvalId,
      approverId,
      operationId: approval.operationId
    });

    return true;
  }

  async rejectRequest(approvalId: string, rejecterId: string, reason?: string): Promise<boolean> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) return false;

    approval.status = 'rejected';
    
    await this.logOperation('approval_rejected', {
      approvalId,
      rejecterId,
      operationId: approval.operationId,
      reason
    });

    return true;
  }

  getPendingApprovals(workspaceId?: string): ApprovalRequest[] {
    const approvals = Array.from(this.pendingApprovals.values());
    if (workspaceId) {
      return approvals.filter(a => a.workspaceId === workspaceId && a.status === 'pending');
    }
    return approvals.filter(a => a.status === 'pending');
  }

  // ---------------------------------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------------------------------

  private assessRiskLevel(patches: PatchOperation[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalPatterns = [
      /\.env/i,
      /secret/i,
      /password/i,
      /api.?key/i,
      /credential/i,
      /schema\.ts$/,
      /migration/i,
      /package\.json$/
    ];

    const highRiskPatterns = [
      /routes\.ts$/,
      /auth/i,
      /security/i,
      /payment/i,
      /stripe/i
    ];

    for (const patch of patches) {
      for (const pattern of criticalPatterns) {
        if (pattern.test(patch.file) || (patch.newContent && pattern.test(patch.newContent))) {
          return 'critical';
        }
      }
    }

    for (const patch of patches) {
      for (const pattern of highRiskPatterns) {
        if (pattern.test(patch.file)) {
          return 'high';
        }
      }
    }

    // Multiple file changes = higher risk
    if (patches.length > 5) return 'high';
    if (patches.length > 2) return 'medium';

    return 'low';
  }

  private async generateDiffPreview(patches: PatchOperation[], originalContent: Map<string, string>): Promise<string> {
    const diffs: string[] = [];

    for (const patch of patches) {
      const original = originalContent.get(patch.file) || '';
      
      switch (patch.type) {
        case 'insert':
          diffs.push(`+++ ${patch.file} (new file)\n${patch.newContent?.split('\n').map(l => `+ ${l}`).join('\n')}`);
          break;
        case 'delete':
          diffs.push(`--- ${patch.file} (deleted)\n${original.split('\n').map(l => `- ${l}`).join('\n')}`);
          break;
        case 'replace':
          if (patch.oldContent && patch.newContent) {
            diffs.push(
              `@@@ ${patch.file}\n` +
              `- ${patch.oldContent.split('\n').join('\n- ')}\n` +
              `+ ${patch.newContent.split('\n').join('\n+ ')}`
            );
          }
          break;
      }
    }

    return diffs.join('\n\n');
  }

  private async logOperation(type: string, data: Record<string, any>): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        action: `trinity_code_ops:${type}`,
        entityType: 'code_ops',
        entityId: data.operationId || crypto.randomUUID(),
        changes: data as any,
        createdAt: new Date()
      });
    } catch (error) {
      log.error('[TrinityCodeOps] Failed to log operation:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // FAST MODE - PARALLEL EXECUTION
  // ---------------------------------------------------------------------------

  async executeFastMode(operations: Array<{ type: 'search' | 'patch' | 'read'; params: any }>): Promise<any[]> {
    log.info(`[TrinityCodeOps] FAST MODE: Executing ${operations.length} operations in parallel`);
    const startTime = Date.now();

    // Separate independent operations for parallel execution
    const searchOps = operations.filter(o => o.type === 'search');
    const readOps = operations.filter(o => o.type === 'read');
    const patchOps = operations.filter(o => o.type === 'patch');

    // Execute reads and searches in parallel
    const parallelResults = await Promise.all([
      ...searchOps.map(o => this.searchCode(o.params)),
      ...readOps.map(o => this.readFile(o.params.file))
    ]);

    // Patches must be sequential to avoid conflicts
    const patchResults: any[] = [];
    for (const op of patchOps) {
      const result = await this.applyPatch(op.params);
      patchResults.push(result);
    }

    const totalTime = Date.now() - startTime;
    log.info(`[TrinityCodeOps] FAST MODE completed in ${totalTime}ms`);

    return [...parallelResults, ...patchResults];
  }

  private async readFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const fullPath = path.resolve(this.projectRoot, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      return { success: true, content };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }
}

export const trinityCodeOps = TrinityCodeOpsService.getInstance();
