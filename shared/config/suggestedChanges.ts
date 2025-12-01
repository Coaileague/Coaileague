/**
 * Suggested Changes Registry
 * 
 * Pre-built change templates for AI Brain to use instead of generating changes from scratch.
 * Each suggestion includes:
 * - Clear use case and when to apply
 * - File modifications with patterns
 * - Related changes that should be batched
 * - Affected modules for impact analysis
 */

export interface SuggestedChangeFile {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  originalContentPattern?: string; // Regex pattern or exact string to find
  proposedContent?: string;
  newFilePath?: string;
  description?: string;
}

export interface SuggestedChange {
  id: string;
  title: string;
  description: string;
  category: 'bugfix' | 'feature' | 'config' | 'security' | 'performance';
  priority: number; // 1-5, 1 being highest
  files: SuggestedChangeFile[];
  affectedModules: string[];
  requiresRestart: boolean;
  requiresDBMigration: boolean;
  relatedSuggestionIds: string[]; // Other changes that should be batched with this
  tags: string[];
  notes: string; // Instructions for AI on when/why to use this
  estimatedImpact: 'low' | 'medium' | 'high';
}

export const SUGGESTED_CHANGES: Record<string, SuggestedChange> = {
  // ============================================================================
  // BUGFIX CATEGORY
  // ============================================================================

  'fix-mark-all-read-whats-new': {
    id: 'fix-mark-all-read-whats-new',
    title: 'Fix What\'s New Mark All Read',
    description: 'Fixes mark all read not updating UI instantly in What\'s New widget',
    category: 'bugfix',
    priority: 1,
    files: [
      {
        filePath: 'client/src/components/whats-new-badge.tsx',
        changeType: 'modify',
        description: 'Update mutation to set cache data before invalidating',
      },
    ],
    affectedModules: ['frontend/whats-new', 'ui/widgets'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: ['fix-mark-all-read-notifications'],
    tags: ['ui-sync', 'notifications', 'cache'],
    notes: 'Use when mark all read mutation is not updating the UI. Solution: call queryClient.setQueryData() in onSuccess before invalidateQueries().',
    estimatedImpact: 'low',
  },

  'fix-mark-all-read-notifications': {
    id: 'fix-mark-all-read-notifications',
    title: 'Fix Notifications Mark All Read',
    description: 'Fixes mark all read not updating UI instantly in Notifications widget',
    category: 'bugfix',
    priority: 1,
    files: [
      {
        filePath: 'client/src/components/notifications-center.tsx',
        changeType: 'modify',
        description: 'Update mutation to set cache data before invalidating and close popover',
      },
    ],
    affectedModules: ['frontend/notifications', 'ui/widgets'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: ['fix-mark-all-read-whats-new'],
    tags: ['ui-sync', 'notifications', 'cache'],
    notes: 'Use when notifications mark all read is not working. Solution: same as what\'s new - setQueryData before invalidate.',
    estimatedImpact: 'low',
  },

  'fix-api-response-status': {
    id: 'fix-api-response-status',
    title: 'Fix API Response Status Code',
    description: 'Updates API endpoint to return correct HTTP status code',
    category: 'bugfix',
    priority: 2,
    files: [
      {
        filePath: 'server/routes.ts',
        changeType: 'modify',
        originalContentPattern: 'res\\.json\\(',
        description: 'Replace res.json() with res.status(200).json() or appropriate status',
      },
    ],
    affectedModules: ['backend/api'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['api', 'http-status'],
    notes: 'Use when API endpoints return 200 OK but should return different status codes (201 Created, 204 No Content, etc).',
    estimatedImpact: 'low',
  },

  // ============================================================================
  // CONFIG CATEGORY
  // ============================================================================

  'enable-feature-flag': {
    id: 'enable-feature-flag',
    title: 'Enable Feature Flag',
    description: 'Enables a feature flag in workspace configuration',
    category: 'config',
    priority: 2,
    files: [
      {
        filePath: 'shared/config/registry.ts',
        changeType: 'modify',
        originalContentPattern: 'featureName:\\s*false',
        description: 'Change feature flag from false to true',
      },
    ],
    affectedModules: ['config/features'],
    requiresRestart: true,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['config', 'features'],
    notes: 'Use to enable disabled features. Requires workflow restart to take effect.',
    estimatedImpact: 'medium',
  },

  'disable-feature-flag': {
    id: 'disable-feature-flag',
    title: 'Disable Feature Flag',
    description: 'Disables a feature flag in workspace configuration',
    category: 'config',
    priority: 2,
    files: [
      {
        filePath: 'shared/config/registry.ts',
        changeType: 'modify',
        originalContentPattern: 'featureName:\\s*true',
        description: 'Change feature flag from true to false',
      },
    ],
    affectedModules: ['config/features'],
    requiresRestart: true,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['config', 'features'],
    notes: 'Use to disable problematic features temporarily. Requires workflow restart.',
    estimatedImpact: 'medium',
  },

  'update-error-message': {
    id: 'update-error-message',
    title: 'Update Error Message',
    description: 'Updates hardcoded error message in code',
    category: 'config',
    priority: 3,
    files: [
      {
        filePath: 'shared/config/registry.ts',
        changeType: 'modify',
        description: 'Update error message in errorMessages or notifications config',
      },
    ],
    affectedModules: ['config/messages', 'ui/errors'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['messages', 'ux'],
    notes: 'Use to update user-facing error messages. Store in config/registry.ts instead of hardcoding.',
    estimatedImpact: 'low',
  },

  // ============================================================================
  // FEATURE CATEGORY
  // ============================================================================

  'add-rbac-rule': {
    id: 'add-rbac-rule',
    title: 'Add RBAC Authorization Rule',
    description: 'Adds new role-based access control rule to restrict feature access',
    category: 'feature',
    priority: 3,
    files: [
      {
        filePath: 'shared/config/registry.ts',
        changeType: 'modify',
        description: 'Add RBAC rule to accessControl configuration',
      },
      {
        filePath: 'server/services/auth/rbacService.ts',
        changeType: 'modify',
        description: 'Register new permission check',
      },
    ],
    affectedModules: ['security/rbac', 'config/access'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['security', 'rbac', 'permissions'],
    notes: 'Use to restrict features by role. Define rule in config, implement check in rbacService.',
    estimatedImpact: 'high',
  },

  'add-email-template': {
    id: 'add-email-template',
    title: 'Add Email Template',
    description: 'Adds new email template for notifications',
    category: 'feature',
    priority: 2,
    files: [
      {
        filePath: 'server/services/email/emailTemplates.ts',
        changeType: 'modify',
        description: 'Add new template to emailTemplates map',
      },
    ],
    affectedModules: ['backend/email', 'notifications'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['email', 'notifications'],
    notes: 'Use to create new email notification types. Define template with variables and HTML.',
    estimatedImpact: 'medium',
  },

  // ============================================================================
  // SECURITY CATEGORY
  // ============================================================================

  'add-input-validation': {
    id: 'add-input-validation',
    title: 'Add Input Validation',
    description: 'Adds Zod schema validation to API endpoint',
    category: 'security',
    priority: 2,
    files: [
      {
        filePath: 'shared/schema.ts',
        changeType: 'modify',
        description: 'Add new Zod schema definition',
      },
      {
        filePath: 'server/routes.ts',
        changeType: 'modify',
        description: 'Use schema validation in endpoint',
      },
    ],
    affectedModules: ['api/validation', 'security/input'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['security', 'validation', 'api'],
    notes: 'Use to secure API endpoints. Define Zod schema in shared/schema.ts, use in route validation.',
    estimatedImpact: 'high',
  },

  // ============================================================================
  // PERFORMANCE CATEGORY
  // ============================================================================

  'add-query-cache': {
    id: 'add-query-cache',
    title: 'Add Query Cache Key',
    description: 'Adds React Query cache configuration to prevent unnecessary refetches',
    category: 'performance',
    priority: 3,
    files: [
      {
        filePath: 'client/src/lib/queryClient.ts',
        changeType: 'modify',
        description: 'Add staleTime/cacheTime configuration for query',
      },
    ],
    affectedModules: ['frontend/cache', 'performance'],
    requiresRestart: false,
    requiresDBMigration: false,
    relatedSuggestionIds: [],
    tags: ['performance', 'cache', 'react-query'],
    notes: 'Use to optimize frontend data fetching. Set appropriate staleTime to reduce API calls.',
    estimatedImpact: 'medium',
  },
};

/**
 * Get suggestion by ID
 */
export function getSuggestedChange(id: string): SuggestedChange | null {
  return SUGGESTED_CHANGES[id] || null;
}

/**
 * Get suggestions by category
 */
export function getSuggestedChangesByCategory(
  category?: SuggestedChange['category']
): SuggestedChange[] {
  if (!category) return Object.values(SUGGESTED_CHANGES);
  return Object.values(SUGGESTED_CHANGES).filter(s => s.category === category);
}

/**
 * Get suggestions by tag
 */
export function getSuggestedChangesByTag(tag: string): SuggestedChange[] {
  return Object.values(SUGGESTED_CHANGES).filter(s => s.tags.includes(tag));
}

/**
 * Get all related suggestions for a change
 */
export function getRelatedSuggestions(suggestionId: string): SuggestedChange[] {
  const suggestion = getSuggestedChange(suggestionId);
  if (!suggestion) return [];
  return suggestion.relatedSuggestionIds
    .map(id => getSuggestedChange(id))
    .filter((s): s is SuggestedChange => s !== null);
}

/**
 * List all suggestions with optional filtering
 */
export function listAllSuggestions(options?: {
  category?: SuggestedChange['category'];
  tag?: string;
  priority?: number;
}): SuggestedChange[] {
  let suggestions = Object.values(SUGGESTED_CHANGES);
  
  if (options?.category) {
    suggestions = suggestions.filter(s => s.category === options.category);
  }
  
  if (options?.tag) {
    suggestions = suggestions.filter(s => s.tags.includes(options.tag));
  }
  
  if (options?.priority && options.priority > 0) {
    suggestions = suggestions.filter(s => s.priority <= options.priority);
  }
  
  return suggestions.sort((a, b) => a.priority - b.priority);
}
