/**
 * TRINITY CODE OPS ACTIONS - AI Brain Orchestrator Integration
 * =============================================================
 * Registers TrinityCodeOps capabilities with the AI Brain Master Orchestrator.
 * Enables Trinity to perform autonomous code search, editing, and commits.
 */

import { trinityCodeOps } from './trinityCodeOps';
import type { ActionRequest, ActionResult } from '../helpai/helpaiActionOrchestrator';
import crypto from 'crypto';

/**
 * Register Trinity Code Ops actions with the orchestrator
 */
export function registerTrinityCodeOpsActions(orchestrator: any): void {
  console.log('[TrinityCodeOps] Registering autonomous coding actions...');

  // ============================================================================
  // CODE SEARCH ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'coding.search_code',
    name: 'AI Code Search',
    category: 'coding',
    description: 'Search codebase using patterns, regex, or natural language descriptions',
    requiredRoles: ['developer', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { pattern, isRegex, caseSensitive, filePattern, directory, contextLines, maxResults } = request.payload || {};

      if (!pattern) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: pattern',
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await trinityCodeOps.searchCode({
        pattern,
        isRegex,
        caseSensitive,
        filePattern,
        directory,
        contextLines,
        maxResults
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: `Found ${result.totalMatches} matches in ${result.searchTimeMs}ms`,
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.find_definition',
    name: 'Find Code Definition',
    category: 'coding',
    description: 'Find where a function, class, or variable is defined',
    requiredRoles: ['developer', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { identifier, type = 'any' } = request.payload || {};

      if (!identifier) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: identifier',
          executionTimeMs: Date.now() - startTime
        };
      }

      // Build pattern based on type
      let pattern: string;
      switch (type) {
        case 'function':
          pattern = `(function\\s+${identifier}|const\\s+${identifier}\\s*=|${identifier}\\s*:\\s*\\(|async\\s+function\\s+${identifier})`;
          break;
        case 'class':
          pattern = `class\\s+${identifier}`;
          break;
        case 'interface':
          pattern = `(interface\\s+${identifier}|type\\s+${identifier})`;
          break;
        case 'export':
          pattern = `export\\s+(const|function|class|interface|type)\\s+${identifier}`;
          break;
        default:
          pattern = `(function|const|let|var|class|interface|type|export)\\s+${identifier}`;
      }

      const result = await trinityCodeOps.searchCode({
        pattern,
        isRegex: true,
        filePattern: '*.ts',
        contextLines: 5,
        maxResults: 20
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: `Found ${result.totalMatches} definitions for "${identifier}"`,
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.find_usages',
    name: 'Find Code Usages',
    category: 'coding',
    description: 'Find all usages of a function, class, or variable',
    requiredRoles: ['developer', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { identifier, excludeDefinitions = true } = request.payload || {};

      if (!identifier) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: identifier',
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await trinityCodeOps.searchCode({
        pattern: identifier,
        isRegex: false,
        filePattern: '*.ts',
        contextLines: 2,
        maxResults: 50
      });

      // Filter out definitions if requested
      let usages = result.results;
      if (excludeDefinitions) {
        const definitionPatterns = [
          new RegExp(`(function|const|let|var|class|interface|type|export)\\s+${identifier}`),
          new RegExp(`${identifier}\\s*:\\s*\\(`),
          new RegExp(`${identifier}\\s*=\\s*function`)
        ];
        usages = usages.filter(r => !definitionPatterns.some(p => p.test(r.match)));
      }

      return {
        success: result.success,
        actionId: request.actionId,
        message: `Found ${usages.length} usages of "${identifier}"`,
        data: { ...result, results: usages, totalMatches: usages.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // PATCH APPLICATION ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'coding.apply_patch',
    name: 'Apply Code Patch',
    category: 'coding',
    description: 'Apply structured code changes with diff preview and rollback capability',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { patches, commitMessage, autoCommit = false, reasoning } = request.payload || {};

      if (!patches || !Array.isArray(patches) || patches.length === 0) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: patches (array of patch operations)',
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await trinityCodeOps.applyPatch({
        operationId: crypto.randomUUID(),
        workspaceId: request.workspaceId!,
        userId: request.userId!,
        patches,
        commitMessage,
        autoCommit,
        requiresApproval: true,
        reasoning
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success
          ? `Applied ${result.appliedPatches} patches successfully`
          : `Patch application failed: ${result.errors.join(', ')}`,
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.preview_patch',
    name: 'Preview Code Patch',
    category: 'coding',
    description: 'Generate a diff preview without applying changes',
    requiredRoles: ['developer', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { file, oldContent, newContent } = request.payload || {};

      if (!file || !oldContent || !newContent) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: file, oldContent, newContent',
          executionTimeMs: Date.now() - startTime
        };
      }

      const diffPreview = `@@@ ${file}\n- ${oldContent.split('\n').join('\n- ')}\n+ ${newContent.split('\n').join('\n+ ')}`;

      return {
        success: true,
        actionId: request.actionId,
        message: 'Diff preview generated',
        data: { diffPreview, file },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.rollback_patch',
    name: 'Rollback Code Changes',
    category: 'coding',
    description: 'Rollback a previous patch operation',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { operationId } = request.payload || {};

      if (!operationId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: operationId',
          executionTimeMs: Date.now() - startTime
        };
      }

      const success = await trinityCodeOps.rollbackOperation(operationId);

      return {
        success,
        actionId: request.actionId,
        message: success ? 'Rollback completed successfully' : 'Rollback failed - operation not found or already rolled back',
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // GIT OPERATIONS ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'coding.commit_changes',
    name: 'Commit Code Changes',
    category: 'coding',
    description: 'Commit staged or specified files with a message',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { files, message, coAuthors } = request.payload || {};

      if (!files || !message) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: files, message',
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await trinityCodeOps.commitChanges({
        workspaceId: request.workspaceId!,
        userId: request.userId!,
        files,
        message,
        author: 'Trinity AI <trinity@coaileague.ai>',
        coAuthors
      });

      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success
          ? `Committed ${result.filesChanged} files (${result.insertions}+ ${result.deletions}-) - ${result.commitHash?.substring(0, 7)}`
          : `Commit failed: ${result.error}`,
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.get_diff',
    name: 'Get Git Diff',
    category: 'coding',
    description: 'Get the current git diff for modified files',
    requiredRoles: ['developer', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { files } = request.payload || {};

      const diff = await trinityCodeOps.getDiff(files);

      return {
        success: true,
        actionId: request.actionId,
        message: diff ? `Diff generated (${diff.length} characters)` : 'No changes detected',
        data: { diff },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.get_status',
    name: 'Get Git Status',
    category: 'coding',
    description: 'Get the current git status (modified, staged, untracked files)',
    requiredRoles: ['developer', 'manager', 'admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();

      const status = await trinityCodeOps.getStatus();
      const totalChanges = status.modified.length + status.staged.length + status.untracked.length;

      return {
        success: true,
        actionId: request.actionId,
        message: `${totalChanges} files changed (${status.modified.length} modified, ${status.staged.length} staged, ${status.untracked.length} untracked)`,
        data: status,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // APPROVAL WORKFLOW ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'coding.approve_change',
    name: 'Approve Pending Change',
    category: 'coding',
    description: 'Approve a pending code change request',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { approvalId } = request.payload || {};

      if (!approvalId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: approvalId',
          executionTimeMs: Date.now() - startTime
        };
      }

      const success = await trinityCodeOps.approveRequest(approvalId, request.userId!);

      return {
        success,
        actionId: request.actionId,
        message: success ? 'Change approved successfully' : 'Approval failed - request not found or already processed',
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.reject_change',
    name: 'Reject Pending Change',
    category: 'coding',
    description: 'Reject a pending code change request',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { approvalId, reason } = request.payload || {};

      if (!approvalId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: approvalId',
          executionTimeMs: Date.now() - startTime
        };
      }

      const success = await trinityCodeOps.rejectRequest(approvalId, request.userId!, reason);

      return {
        success,
        actionId: request.actionId,
        message: success ? 'Change rejected' : 'Rejection failed - request not found or already processed',
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'coding.list_pending_approvals',
    name: 'List Pending Approvals',
    category: 'coding',
    description: 'List all pending code change approval requests',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();

      const approvals = trinityCodeOps.getPendingApprovals(request.workspaceId);

      return {
        success: true,
        actionId: request.actionId,
        message: `${approvals.length} pending approval(s)`,
        data: { approvals },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // FAST MODE ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'coding.fast_mode_execute',
    name: 'FAST Mode Parallel Execution',
    category: 'coding',
    description: 'Execute multiple code operations in parallel for maximum speed',
    requiredRoles: ['admin', 'super_admin', 'owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { operations } = request.payload || {};

      if (!operations || !Array.isArray(operations)) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: operations (array)',
          executionTimeMs: Date.now() - startTime
        };
      }

      const results = await trinityCodeOps.executeFastMode(operations);

      return {
        success: true,
        actionId: request.actionId,
        message: `FAST MODE: Completed ${results.length} operations in ${Date.now() - startTime}ms`,
        data: { results, operationCount: results.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  console.log('[TrinityCodeOps] Registered 14 autonomous coding actions');
}
