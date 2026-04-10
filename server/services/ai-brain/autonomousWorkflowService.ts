/**
 * Autonomous Workflow Service
 * 
 * Coordinates AI Brain's autonomous code workflow:
 * 1. Search for relevant suggestions
 * 2. Stage changes
 * 3. Auto-approve trusted templates
 * 4. Apply approved changes
 * 5. Handle failures and rollback
 */

import crypto from 'crypto';
import { suggestedChangesService } from './suggestedChangesService';
import { AIBrainCodeEditorService } from './aiBrainCodeEditor';
import { getSuggestedChange } from '@shared/config/suggestedChanges';
import { createLogger } from '../../lib/logger';
const log = createLogger('autonomousWorkflowService');

interface WorkflowResult {
  success: boolean;
  workflowId: string;
  suggestionId: string;
  stagedChangeIds: string[];
  approvedChangeIds: string[];
  appliedChangeIds: string[];
  errors: string[];
  message: string;
}

class AutonomousWorkflowService {
  private static instance: AutonomousWorkflowService;
  private codeEditor: AIBrainCodeEditorService;

  static getInstance(): AutonomousWorkflowService {
    if (!this.instance) {
      this.instance = new AutonomousWorkflowService();
    }
    return this.instance;
  }

  constructor() {
    this.codeEditor = AIBrainCodeEditorService.getInstance();
  }

  /**
   * Execute complete autonomous workflow for a suggested change
   * 1. Stage the change
   * 2. Auto-approve if trusted
   * 3. Apply it
   */
  async executeWorkflow(
    suggestionId: string,
    requestedBy: string,
    includeRelated: boolean = true
  ): Promise<WorkflowResult> {
    const workflowId = `workflow-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const errors: string[] = [];
    
    try {
      log.info(`[AutonomousWorkflow] Starting workflow ${workflowId} for suggestion: ${suggestionId}`);

      // Step 1: Verify suggestion exists
      const suggestion = getSuggestedChange(suggestionId);
      if (!suggestion) {
        return {
          success: false,
          workflowId,
          suggestionId,
          stagedChangeIds: [],
          approvedChangeIds: [],
          appliedChangeIds: [],
          errors: [`Suggested change not found: ${suggestionId}`],
          message: 'Suggestion not found',
        };
      }

      // Step 2: Stage the suggested change
      log.info(`[AutonomousWorkflow] Staging change: ${suggestion.title}`);
      const stageResult = await suggestedChangesService.stageSuggestedChange(
        suggestionId,
        requestedBy,
        includeRelated
      );

      if (!stageResult.success) {
        return {
          success: false,
          workflowId,
          suggestionId,
          stagedChangeIds: [],
          approvedChangeIds: [],
          appliedChangeIds: [],
          errors: stageResult.errors || ['Failed to stage changes'],
          message: 'Staging failed',
        };
      }

      const stagedChangeIds = stageResult.changeIds || [];
      const approvedChangeIds: string[] = [];
      const appliedChangeIds: string[] = [];

      // Step 3: Auto-approve if this is a trusted template
      if (suggestion.autoApprovable !== false) {
        log.info(`[AutonomousWorkflow] Auto-approving trusted change: ${suggestionId}`);
        
        for (const changeId of stagedChangeIds) {
          try {
            const approveResult = await this.codeEditor.approveChange(
              changeId,
              requestedBy,
              `Auto-approved trusted template: ${suggestion.title}`
            );

            if (approveResult.success) {
              approvedChangeIds.push(changeId);
              log.info(`[AutonomousWorkflow] Approved change: ${changeId}`);
            } else {
              errors.push(`Failed to approve change ${changeId}: ${approveResult.message}`);
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`Error approving change ${changeId}: ${errorMsg}`);
          }
        }
      } else {
        // Requires manual approval
        log.info(`[AutonomousWorkflow] Change requires manual approval: ${suggestionId}`);
      }

      // Step 4: Apply approved changes
      for (const changeId of approvedChangeIds) {
        try {
          const applyResult = await this.codeEditor.applyChange(
            changeId,
            requestedBy,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            {
              pushWhatsNew: true,
              whatsNewTitle: `Implemented: ${suggestion.title}`,
              whatsNewDescription: suggestion.description,
            }
          );

          if (applyResult.success) {
            appliedChangeIds.push(changeId);
            log.info(`[AutonomousWorkflow] Applied change: ${changeId}`);
          } else {
            errors.push(`Failed to apply change ${changeId}: ${applyResult.message}`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Error applying change ${changeId}: ${errorMsg}`);
        }
      }

      const success = appliedChangeIds.length > 0 || (approvedChangeIds.length === 0 && stagedChangeIds.length > 0);

      log.info(`[AutonomousWorkflow] Workflow ${workflowId} completed`, {
        staged: stagedChangeIds.length,
        approved: approvedChangeIds.length,
        applied: appliedChangeIds.length,
        errors: errors.length,
      });

      return {
        success,
        workflowId,
        suggestionId,
        stagedChangeIds,
        approvedChangeIds,
        appliedChangeIds,
        errors,
        message: success
          ? `Workflow completed: staged ${stagedChangeIds.length}, approved ${approvedChangeIds.length}, applied ${appliedChangeIds.length}`
          : `Workflow partially completed with ${errors.length} errors`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[AutonomousWorkflow] Workflow ${workflowId} failed:`, error);

      return {
        success: false,
        workflowId,
        suggestionId,
        stagedChangeIds: [],
        approvedChangeIds: [],
        appliedChangeIds: [],
        errors: [errorMsg],
        message: 'Workflow execution failed',
      };
    }
  }

  /**
   * Execute workflow for highest priority bugfixes
   * Used by support console to quickly fix critical issues
   */
  async executeHighPriorityFixes(requestedBy: string): Promise<{
    workflowId: string;
    results: WorkflowResult[];
  }> {
    const workflowId = `batch-workflow-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const fixes = suggestedChangesService.getHighPriorityFixes();
    const results: WorkflowResult[] = [];

    log.info(`[AutonomousWorkflow] Executing high-priority fixes batch: ${fixes.length} fixes`);

    for (const fix of fixes) {
      const result = await this.executeWorkflow(fix.id, requestedBy, false);
      results.push(result);

      if (!result.success && result.errors.length > 0) {
        log.warn(`[AutonomousWorkflow] Fix ${fix.id} failed, continuing with others`);
      }
    }

    return { workflowId, results };
  }

  /**
   * Search for fixes for an issue and execute workflow
   * Used by AI Brain diagnostics
   */
  async searchAndExecuteForIssue(
    issueType: string,
    requestedBy: string
  ): Promise<WorkflowResult | null> {
    const suggestions = suggestedChangesService.getSuggestionsForIssueType(issueType);

    if (suggestions.length === 0) {
      log.info(`[AutonomousWorkflow] No suggestions found for issue: ${issueType}`);
      return null;
    }

    // Execute the highest priority suggestion
    const topSuggestion = suggestions.sort((a, b) => a.priority - b.priority)[0];
    return this.executeWorkflow(topSuggestion.id, requestedBy, true);
  }
}

export const autonomousWorkflowService = AutonomousWorkflowService.getInstance();
