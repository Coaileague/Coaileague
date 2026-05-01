/**
 * FEATURE REGISTRY SERVICE
 * =========================
 * Provides Trinity AI with full platform feature visibility and notification validation.
 * 
 * Core responsibilities:
 * - Feature lookup and synonym resolution
 * - Stale data detection (references to deprecated/removed features)
 * - Vague language detection and rejection
 * - Structured content validation (Problem→Issue→Solution→Outcome)
 * - Pre-UNS content enrichment and blocking
 */

import {
  FEATURE_REGISTRY,
  PlatformFeature,
  FeatureCategory,
  TierAvailability,
  VAGUE_LANGUAGE_PATTERNS,
  NOTIFICATION_STRUCTURE_REQUIREMENTS,
  StructuredNotificationContent,
  getActiveFeatures,
  getFeatureById,
  getFeatureBySynonym,
  isFeatureActive,
  isFeatureDeprecatedOrRemoved,
  getFeaturesByCategory,
  getFeaturesByTier,
  getAllFeatureNames,
  getRecentlyUpdatedFeatures,
} from "@shared/config/featureRegistry";

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  enrichedContent?: EnrichedNotificationContent;
}

export interface ValidationIssue {
  type: "stale_reference" | "vague_language" | "missing_structure" | "unknown_feature" | "tier_mismatch" | "generic_title";
  severity: "warning" | "critical";
  field: string;
  message: string;
  originalValue?: string;
  suggestedFix?: string;
}

export interface EnrichedNotificationContent {
  title: string;
  message: string;
  structuredContent?: StructuredNotificationContent;
  featureReferences: FeatureReference[];
  metadata: {
    validatedAt: string;
    featureContext: Record<string, unknown>;
    enrichmentApplied: boolean;
  };
}

export interface FeatureReference {
  featureId: string;
  featureName: string;
  state: string;
  category: string;
  tier: TierAvailability[];
  lastUpdated: string;
  wasResolved: boolean;
  originalTerm?: string;
}

// ============================================================================
// FEATURE REGISTRY SERVICE
// ============================================================================
class FeatureRegistryService {
  private featureNameIndex: Map<string, string> = new Map();
  private synonymIndex: Map<string, string> = new Map();

  constructor() {
    this.buildIndexes();
  }

  /**
   * Build lookup indexes for fast feature resolution
   */
  private buildIndexes(): void {
    for (const feature of Object.values(FEATURE_REGISTRY)) {
      this.featureNameIndex.set(feature.name.toLowerCase(), feature.id);
      this.featureNameIndex.set(feature.id.toLowerCase(), feature.id);
      
      for (const synonym of feature.synonyms) {
        this.synonymIndex.set(synonym.toLowerCase(), feature.id);
      }
    }
  }

  // ==========================================================================
  // FEATURE LOOKUP METHODS
  // ==========================================================================

  /**
   * Get a feature by ID
   */
  getFeature(id: string): PlatformFeature | undefined {
    return getFeatureById(id);
  }

  /**
   * Resolve a term to a feature (checks ID, name, and synonyms)
   */
  resolveFeature(term: string): PlatformFeature | undefined {
    const lowerTerm = term.toLowerCase();
    
    const directId = this.featureNameIndex.get(lowerTerm);
    if (directId) return FEATURE_REGISTRY[directId];
    
    const synonymId = this.synonymIndex.get(lowerTerm);
    if (synonymId) return FEATURE_REGISTRY[synonymId];
    
    return getFeatureBySynonym(term);
  }

  /**
   * Get all active features
   */
  getActiveFeatures(): PlatformFeature[] {
    return getActiveFeatures();
  }

  /**
   * Get features by category
   */
  getFeaturesByCategory(category: FeatureCategory): PlatformFeature[] {
    return getFeaturesByCategory(category);
  }

  /**
   * Get features available for a tier
   */
  getFeaturesByTier(tier: TierAvailability): PlatformFeature[] {
    return getFeaturesByTier(tier);
  }

  /**
   * Get recently updated features
   */
  getRecentChanges(daysAgo: number = 30): PlatformFeature[] {
    return getRecentlyUpdatedFeatures(daysAgo);
  }

  /**
   * Get feature summary for Trinity context
   */
  getFeatureSummary(): {
    totalFeatures: number;
    activeFeatures: number;
    recentlyUpdated: number;
    byCategory: Record<string, number>;
  } {
    const all = Object.values(FEATURE_REGISTRY);
    const active = all.filter(f => f.state === "active");
    const recent = this.getRecentChanges(7);
    
    const byCategory: Record<string, number> = {};
    for (const f of active) {
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    }

    return {
      totalFeatures: all.length,
      activeFeatures: active.length,
      recentlyUpdated: recent.length,
      byCategory,
    };
  }

  // ==========================================================================
  // VALIDATION METHODS
  // ==========================================================================

  /**
   * Validate notification content before sending to UNS
   * Returns validation result with issues and suggestions
   */
  validateNotificationContent(
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];
    const featureReferences: FeatureReference[] = [];

    this.checkGenericTitle(title, issues, suggestions);
    this.checkVagueLanguage(title, "title", issues, suggestions);
    this.checkVagueLanguage(message, "message", issues, suggestions);
    this.checkStaleReferences(title + " " + message, issues, suggestions);
    
    // Check for structured content requirements (Problem→Issue→Solution→Outcome)
    this.checkStructuredContentRequirements(message, issues, suggestions);
    const foundFeatures = this.extractAndValidateFeatureReferences(
      title + " " + message,
      featureReferences,
      issues
    );
    if (!foundFeatures && !metadata?.skipFeatureCheck) {
      issues.push({
        type: "unknown_feature",
        severity: "warning",
        field: "content",
        message: "No concrete feature references found. Notifications should reference specific platform features.",
        suggestedFix: "Include the specific feature name this notification relates to.",
      });
    }
    const hasCriticalIssues = issues.some(i => i.severity === "critical");
    const valid = !hasCriticalIssues;
    const enrichedContent: EnrichedNotificationContent = {
      title,
      message,
      featureReferences,
      metadata: {
        validatedAt: new Date().toISOString(),
        featureContext: this.buildFeatureContext(featureReferences),
        enrichmentApplied: featureReferences.length > 0,
      },
    };

    return { valid, issues, suggestions, enrichedContent };
  }

  /**
   * Check for generic/vague titles
   */
  private checkGenericTitle(
    title: string,
    issues: ValidationIssue[],
    suggestions: string[]
  ): void {
    const lowerTitle = title.toLowerCase().trim();
    
    for (const generic of VAGUE_LANGUAGE_PATTERNS.genericTitles) {
      if (lowerTitle === generic.toLowerCase()) {
        issues.push({
          type: "generic_title",
          severity: "critical",
          field: "title",
          message: `"${title}" is too generic. Notifications must have specific, descriptive titles.`,
          originalValue: title,
          suggestedFix: "Use a specific title like 'Trinity AI Scheduling - Coverage Gap Detected' or 'GPS Tracking - Geofence Violation Alert'",
        });
        suggestions.push("Replace generic title with feature-specific title");
        break;
      }
    }
  }

  /**
   * Check for vague language patterns
   */
  private checkVagueLanguage(
    text: string,
    field: string,
    issues: ValidationIssue[],
    suggestions: string[]
  ): void {
    for (const pattern of VAGUE_LANGUAGE_PATTERNS.vagueDescriptions) {
      if (pattern.test(text)) {
        issues.push({
          type: "vague_language",
          severity: "warning",
          field,
          message: `Vague language detected: "${text.substring(0, 50)}...". Be specific about what changed.`,
          originalValue: text,
          suggestedFix: "Describe the specific change: What feature? What happened? What's the impact?",
        });
        suggestions.push(`Rewrite ${field} to be more specific`);
        break;
      }
    }
    for (const pattern of VAGUE_LANGUAGE_PATTERNS.missingContext) {
      if (pattern.test(text)) {
        issues.push({
          type: "vague_language",
          severity: "warning",
          field,
          message: `Missing context in ${field}: refers to "a feature" or "this feature" without naming it`,
          originalValue: text,
          suggestedFix: "Name the specific feature (e.g., 'GPS Tracking', 'Shift Scheduling', 'Trinity AI')",
        });
        break;
      }
    }

    // CRITICAL: Check for vague issue counts - these are NOT actionable and should be BLOCKED
    // Pattern: "Found 309 issues (0 critical, 83 errors)" - tells user nothing useful
    if (VAGUE_LANGUAGE_PATTERNS.vagueIssueCounts) {
      for (const pattern of VAGUE_LANGUAGE_PATTERNS.vagueIssueCounts) {
        if (pattern.test(text)) {
          issues.push({
            type: "vague_language",
            severity: "critical", // CRITICAL = BLOCKING - vague counts are not acceptable
            field,
            message: `Vague issue count detected: "${text.substring(0, 80)}...". Notifications must include specific examples, affected files, and actionable guidance.`,
            originalValue: text,
            suggestedFix: "Include: 1) Top 3 specific issues with file paths, 2) What's wrong in each, 3) How to resolve. Example: 'TypeScript errors in server/routes.ts: Missing return type on line 42, undefined variable on line 67. Run npx tsc to see details.'",
          });
          break;
        }
      }
    }
  }

  /**
   * Check for structured content requirements (Problem→Issue→Solution→Outcome)
   * Non-AI enriched notifications should have clear structure
   */
  private checkStructuredContentRequirements(
    message: string,
    issues: ValidationIssue[],
    suggestions: string[]
  ): void {
    // Very short messages lack structure
    if (message.length < 30) {
      issues.push({
        type: "missing_structure",
        severity: "warning",
        field: "message",
        message: "Message too brief to convey structured context (Problem→Issue→Solution→Outcome)",
        originalValue: message,
        suggestedFix: "Expand to describe: What happened? Why it matters? What's the resolution?",
      });
      suggestions.push("Add structured context to message");
      return;
    }

    // Check for action-oriented structure (indicates the message is informative)
    const hasActionIndicators = [
      /\b(detected|identified|found|discovered)\b/i,  // Problem identification
      /\b(because|due to|caused by|resulted in)\b/i, // Cause/issue
      /\b(resolved|fixed|completed|scheduled|applied)\b/i, // Solution
      /\b(now|will|updated|enabled|available)\b/i, // Outcome
    ];
    
    const structureScore = hasActionIndicators.filter(p => p.test(message)).length;
    
    // If message lacks structural indicators (0-1 matches), flag as warning
    if (structureScore < 2) {
      issues.push({
        type: "missing_structure",
        severity: "warning",
        field: "message",
        message: "Message may lack clear structure. Prefer: What happened → Why it matters → What's the outcome",
        originalValue: message.substring(0, 50) + "...",
        suggestedFix: "Include problem identification, cause, and resolution/outcome in the message",
      });
      suggestions.push("Add Problem→Issue→Solution→Outcome structure");
    }
  }

  /**
   * Check for references to deprecated/removed features
   */
  private checkStaleReferences(
    text: string,
    issues: ValidationIssue[],
    suggestions: string[]
  ): void {
    const lowerText = text.toLowerCase();
    for (const staleRef of VAGUE_LANGUAGE_PATTERNS.staleReferences) {
      if (lowerText.includes(staleRef.toLowerCase())) {
        issues.push({
          type: "stale_reference",
          severity: "critical",
          field: "content",
          message: `Stale reference detected: "${staleRef}". This feature or term is deprecated/removed.`,
          originalValue: staleRef,
          suggestedFix: "Use current feature names. Check feature registry for active features.",
        });
        suggestions.push(`Remove or replace reference to "${staleRef}"`);
      }
    }
    for (const [id, feature] of Object.entries(FEATURE_REGISTRY)) {
      if (feature.state === "deprecated" || feature.state === "removed") {
        const nameLower = feature.name.toLowerCase();
        if (lowerText.includes(nameLower)) {
          const replacement = feature.relatedFeatures[0] 
            ? FEATURE_REGISTRY[feature.relatedFeatures[0]]?.name 
            : null;
          
          issues.push({
            type: "stale_reference",
            severity: "critical",
            field: "content",
            message: `Reference to ${feature.state} feature: "${feature.name}"`,
            originalValue: feature.name,
            suggestedFix: replacement 
              ? `Use "${replacement}" instead` 
              : "Remove this reference or use a current feature",
          });
        }
      }
    }
  }

  /**
   * Extract and validate feature references from text
   */
  private extractAndValidateFeatureReferences(
    text: string,
    featureRefs: FeatureReference[],
    issues: ValidationIssue[]
  ): boolean {
    const lowerText = text.toLowerCase();
    let foundAny = false;
    for (const feature of Object.values(FEATURE_REGISTRY)) {
      if (feature.state !== "active" && feature.state !== "beta") continue;
      
      const nameLower = feature.name.toLowerCase();
      let matched = false;
      let matchedTerm = feature.name;
      if (lowerText.includes(nameLower)) {
        matched = true;
      }
      if (!matched) {
        for (const synonym of feature.synonyms) {
          if (lowerText.includes(synonym.toLowerCase())) {
            matched = true;
            matchedTerm = synonym;
            break;
          }
        }
      }

      if (matched) {
        foundAny = true;
        featureRefs.push({
          featureId: feature.id,
          featureName: feature.name,
          state: feature.state,
          category: feature.category,
          tier: feature.availableTiers,
          lastUpdated: feature.lastUpdated,
          wasResolved: matchedTerm !== feature.name,
          originalTerm: matchedTerm !== feature.name ? matchedTerm : undefined,
        });
      }
    }

    return foundAny;
  }

  /**
   * Build feature context for enriched notifications
   */
  private buildFeatureContext(refs: FeatureReference[]): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    
    for (const ref of refs) {
      const feature = FEATURE_REGISTRY[ref.featureId];
      if (feature) {
        context[ref.featureId] = {
          name: feature.name,
          description: feature.description,
          category: feature.category,
          version: feature.version,
          lastUpdated: feature.lastUpdated,
          recentChanges: feature.changelog.slice(0, 3),
        };
      }
    }

    return context;
  }

  // ==========================================================================
  // STRUCTURED CONTENT VALIDATION
  // ==========================================================================

  /**
   * Validate structured notification content (Problem→Issue→Solution→Outcome)
   */
  validateStructuredContent(content: Partial<StructuredNotificationContent>): ValidationResult {
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    for (const field of NOTIFICATION_STRUCTURE_REQUIREMENTS.requiredFields) {
      const value = content[field];
      
      if (!value || value.trim().length === 0) {
        issues.push({
          type: "missing_structure",
          severity: "critical",
          field,
          message: `Missing required field: ${field}`,
          suggestedFix: `Provide a clear ${field} statement`,
        });
      } else if (value.length < NOTIFICATION_STRUCTURE_REQUIREMENTS.minFieldLength) {
        issues.push({
          type: "missing_structure",
          severity: "warning",
          field,
          message: `${field} is too short (${value.length} chars, min ${NOTIFICATION_STRUCTURE_REQUIREMENTS.minFieldLength})`,
          suggestedFix: `Expand ${field} with more detail`,
        });
      }
    }
    if (content.outcome && NOTIFICATION_STRUCTURE_REQUIREMENTS.requiresMeasurableOutcome) {
      const hasNumbers = /\d/.test(content.outcome);
      const hasTimeReference = /(now|immediately|within|by|before|after)/i.test(content.outcome);
      const hasActionVerb = /(can|will|should|must|able to)/i.test(content.outcome);
      
      if (!hasNumbers && !hasTimeReference && !hasActionVerb) {
        issues.push({
          type: "missing_structure",
          severity: "warning",
          field: "outcome",
          message: "Outcome should be measurable or actionable",
          suggestedFix: "Include specific results, numbers, or actions the user can take",
        });
      }
    }

    const valid = !issues.some(i => i.severity === "critical");
    return { valid, issues, suggestions };
  }

  // ==========================================================================
  // ENRICHMENT METHODS
  // ==========================================================================

  /**
   * Enrich notification with feature context
   * Called before sending to UNS
   */
  enrichNotification(
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): EnrichedNotificationContent {
    const validation = this.validateNotificationContent(title, message, metadata);
    
    if (validation.enrichedContent) {
      return validation.enrichedContent;
    }
    return {
      title,
      message,
      featureReferences: [],
      metadata: {
        validatedAt: new Date().toISOString(),
        featureContext: {},
        enrichmentApplied: false,
      },
    };
  }

  /**
   * Generate structured content from a simple message
   */
  generateStructuredContent(
    title: string,
    message: string,
    context?: {
      featureId?: string;
      severity?: string;
      source?: string;
    }
  ): StructuredNotificationContent | null {
    const feature = context?.featureId ? this.getFeature(context.featureId) : null;
    const featureContext = feature 
      ? `${feature.name} (${feature.category}): ${feature.description}` 
      : message;
    return {
      problem: `Issue detected in ${feature?.name || "platform"}`,
      issue: message,
      solution: `Review ${feature?.name || "the affected area"} and take appropriate action`,
      outcome: `${feature?.name || "The system"} will function correctly after resolution`,
    };
  }

  // ==========================================================================
  // TRINITY CONTEXT METHODS
  // ==========================================================================

  /**
   * Get full feature context for Trinity AI
   */
  getTrinityContext(): {
    features: PlatformFeature[];
    summary: ReturnType<typeof this.getFeatureSummary>;
    recentChanges: PlatformFeature[];
    deprecatedFeatures: PlatformFeature[];
  } {
    return {
      features: this.getActiveFeatures(),
      summary: this.getFeatureSummary(),
      recentChanges: this.getRecentChanges(7),
      deprecatedFeatures: Object.values(FEATURE_REGISTRY).filter(
        f => f.state === "deprecated" || f.state === "removed"
      ),
    };
  }

  /**
   * Check if a notification should be blocked (critical validation failures)
   */
  shouldBlockNotification(title: string, message: string): {
    block: boolean;
    reason?: string;
  } {
    const validation = this.validateNotificationContent(title, message);
    
    if (!validation.valid) {
      const criticalIssues = validation.issues.filter(i => i.severity === "critical");
      if (criticalIssues.length > 0) {
        return {
          block: true,
          reason: criticalIssues.map(i => i.message).join("; "),
        };
      }
    }

    return { block: false };
  }
}

export const featureRegistryService = new FeatureRegistryService();
