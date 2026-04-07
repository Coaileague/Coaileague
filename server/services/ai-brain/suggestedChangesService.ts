/**
 * Suggested Changes Service
 * 
 * Provides AI Brain with access to pre-vetted change templates.
 * Helps AI make better decisions about what changes to propose.
 */

import {
  SUGGESTED_CHANGES,
  getSuggestedChange,
  getSuggestedChangesByCategory,
  getSuggestedChangesByTag,
  getRelatedSuggestions,
  listAllSuggestions,
  type SuggestedChange,
} from '@shared/config/suggestedChanges';
import { AIBrainCodeEditorService } from './aiBrainCodeEditor';
import type { CodeChangeRequest, BatchChangeRequest } from './aiBrainCodeEditor';
import { createLogger } from '../../lib/logger';
const log = createLogger('suggestedChangesService');

class SuggestedChangesService {
  private static instance: SuggestedChangesService;
  private codeEditor: AIBrainCodeEditorService;

  static getInstance(): SuggestedChangesService {
    if (!this.instance) {
      this.instance = new SuggestedChangesService();
    }
    return this.instance;
  }

  constructor() {
    this.codeEditor = AIBrainCodeEditorService.getInstance();
  }

  /**
   * Search for relevant suggested changes based on description/keywords
   * Used by AI to find pre-built solutions
   */
  searchSuggestions(query: string, options?: { category?: string; tag?: string }): SuggestedChange[] {
    const lowerQuery = query.toLowerCase();
    
    let results = listAllSuggestions(options as any);
    
    // Filter by relevance to query
    results = results.filter(s => 
      s.title.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.notes.toLowerCase().includes(lowerQuery) ||
      s.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );

    return results.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get a suggested change by ID
   */
  getSuggestion(id: string): SuggestedChange | null {
    return getSuggestedChange(id);
  }

  /**
   * Get all related changes for a suggestion
   * Useful for batching related changes together
   */
  getRelatedChanges(suggestionId: string): SuggestedChange[] {
    return getRelatedSuggestions(suggestionId);
  }

  /**
   * List all available suggestions (optionally filtered)
   */
  listSuggestions(options?: {
    category?: string;
    tag?: string;
  }): SuggestedChange[] {
    return listAllSuggestions(options as any);
  }

  /**
   * Convert a suggested change into actual code change requests
   * Bridges suggested templates to the code editor service
   */
  async convertToCodeChanges(suggestionId: string): Promise<CodeChangeRequest[]> {
    const suggestion = getSuggestedChange(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggested change not found: ${suggestionId}`);
    }

    return suggestion.files.map(file => ({
      filePath: file.filePath,
      changeType: file.changeType,
      proposedContent: file.proposedContent,
      newFilePath: file.newFilePath,
      title: suggestion.title,
      description: file.description || suggestion.description,
      category: suggestion.category,
      priority: suggestion.priority,
      affectedModule: suggestion.affectedModules[0],
      requestReason: `Suggested change: ${suggestion.title}`,
    }));
  }

  /**
   * Stage a suggested change for approval
   * Converts suggestion → code changes → staged in editor service
   */
  async stageSuggestedChange(
    suggestionId: string,
    requestedBy: string,
    includeRelated: boolean = false
  ): Promise<{
    success: boolean;
    changeIds?: string[];
    batchId?: string;
    errors?: string[];
  }> {
    try {
      const suggestion = getSuggestedChange(suggestionId);
      if (!suggestion) {
        return { success: false, errors: [`Suggested change not found: ${suggestionId}`] };
      }

      // If including related changes, batch them together
      if (includeRelated && suggestion.relatedSuggestionIds.length > 0) {
        const changes: CodeChangeRequest[] = [];
        
        // Add main suggestion
        const mainChanges = await this.convertToCodeChanges(suggestionId);
        changes.push(...mainChanges);

        // Add related changes
        for (const relatedId of suggestion.relatedSuggestionIds) {
          try {
            const relatedChanges = await this.convertToCodeChanges(relatedId);
            changes.push(...relatedChanges);
          } catch (err) {
            log.error(`Failed to convert related change ${relatedId}:`, err);
          }
        }

        // Stage as batch
        const batchRequest: BatchChangeRequest = {
          title: suggestion.title,
          description: suggestion.description,
          changes,
          whatsNewTitle: `Platform Update: ${suggestion.title}`,
          whatsNewDescription: suggestion.description,
        };

        const result = await this.codeEditor.stageBatchChanges(batchRequest, requestedBy);
        return result;
      }

      // Stage single suggested change
      const changes = await this.convertToCodeChanges(suggestionId);
      const changeIds: string[] = [];

      for (const change of changes) {
        const result = await this.codeEditor.stageCodeChange(change, requestedBy);
        if (result.success && result.changeId) {
          changeIds.push(result.changeId);
        }
      }

      return {
        success: changeIds.length > 0,
        changeIds,
      };
    } catch (error) {
      log.error('[SuggestedChangesService] Error staging suggested change:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Get suggestions by type of issue
   * Used by AI to diagnose and suggest fixes
   */
  getSuggestionsForIssueType(issueType: string): SuggestedChange[] {
    const issueMap: Record<string, { category?: string; tag?: string }> = {
      'ui-not-updating': { tag: 'ui-sync' },
      'api-error': { category: 'bugfix' },
      'missing-validation': { category: 'security' },
      'performance-slow': { category: 'performance' },
      'access-denied': { tag: 'rbac' },
      'email-not-sending': { tag: 'email' },
    };

    const filter = issueMap[issueType];
    return filter ? listAllSuggestions(filter as any) : [];
  }

  /**
   * Get highest priority fixes
   * Used by support console to prioritize urgent issues
   */
  getHighPriorityFixes(): SuggestedChange[] {
    return Object.values(SUGGESTED_CHANGES)
      .filter(s => s.category === 'bugfix' && s.priority <= 2)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if a suggestion requires restart
   */
  requiresRestart(suggestionId: string): boolean {
    const suggestion = getSuggestedChange(suggestionId);
    return suggestion?.requiresRestart || false;
  }

  /**
   * Check if a suggestion requires database migration
   */
  requiresDBMigration(suggestionId: string): boolean {
    const suggestion = getSuggestedChange(suggestionId);
    return suggestion?.requiresDBMigration || false;
  }

  /**
   * Get estimated impact of a change
   * Useful for deciding if change is worth staging
   */
  getEstimatedImpact(suggestionId: string): 'low' | 'medium' | 'high' | null {
    const suggestion = getSuggestedChange(suggestionId);
    return suggestion?.estimatedImpact || null;
  }
}

export const suggestedChangesService = SuggestedChangesService.getInstance();
