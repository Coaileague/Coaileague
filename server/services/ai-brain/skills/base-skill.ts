import type {
  SkillManifest,
  SkillContext,
  SkillResult,
  SkillEvent,
  SkillConfig,
} from './types';
import { createLogger } from '../../../lib/logger';

const log = createLogger('Skill');

/**
 * Abstract base class for all AI Brain Skills
 * 
 * All skills must extend this class and implement required methods.
 * Skills are self-contained, pluggable modules that extend AI Brain capabilities.
 * 
 * @example
 * ```typescript
 * class DocumentOCRSkill extends BaseSkill {
 *   getManifest() {
 *     return {
 *       id: 'document-ocr',
 *       name: 'Document OCR',
 *       version: '1.0.0',
 *       category: 'document-processing',
 *       // ...
 *     };
 *   }
 * 
 *   async execute(context, params) {
 *     // OCR implementation
 *     return { success: true, data: extractedText };
 *   }
 * }
 * ```
 */
export abstract class BaseSkill {
  protected config: SkillConfig = { enabled: true };
  protected eventHandlers: Map<string, Function[]> = new Map();

  /**
   * Get skill metadata and configuration
   */
  abstract getManifest(): SkillManifest;

  /**
   * Initialize the skill
   * Called once when skill is loaded
   */
  async initialize(config?: SkillConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    log.info(`[Skill] Initialized: ${this.getManifest().id}`);
  }

  /**
   * Execute the skill's primary function
   * @param context - Execution context (user, workspace, roles, etc.)
   * @param params - Skill-specific parameters
   */
  abstract execute(context: SkillContext, params: any): Promise<SkillResult>;

  /**
   * Validate skill can execute with given context
   * Checks tier gating, role requirements, etc.
   */
  async canExecute(context: SkillContext): Promise<boolean> {
    const manifest = this.getManifest();

    // Check tier requirements
    if (manifest.requiredTier && context.subscriptionTier) {
      const tierHierarchy = { free: 1, starter: 2, professional: 3, enterprise: 4 };
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const requiredLevel = tierHierarchy[manifest.requiredTier];
      const currentLevel = tierHierarchy[context.subscriptionTier as keyof typeof tierHierarchy] || 1;
      
      if (currentLevel < requiredLevel) {
        return false;
      }
    }

    // Check role requirements
    if (manifest.requiredRole && context.workspaceRole) {
      if (!manifest.requiredRole.includes(context.workspaceRole)) {
        return false;
      }
    }

    return this.config.enabled;
  }

  /**
   * Subscribe to events
   */
  on(eventType: string, handler: (event: SkillEvent) => void | Promise<void>): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  /**
   * Emit events to subscribers
   */
  protected async emit(eventType: string, event: SkillEvent): Promise<void> {
    const handlers = this.eventHandlers.get(eventType) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        log.error(`[Skill] Event handler error for ${eventType}:`, error);
      }
    }
  }

  /**
   * Handle incoming events from other skills or system
   */
  async handleEvent(event: SkillEvent): Promise<void> {
    const manifest = this.getManifest();
    if (manifest.eventSubscriptions?.includes(event.eventType)) {
      await this.onEvent(event);
    }
  }

  /**
   * Override this to handle subscribed events
   */
  protected async onEvent(event: SkillEvent): Promise<void> {
    // Default: no-op, skills can override
  }

  /**
   * Cleanup when skill is unloaded
   */
  async cleanup(): Promise<void> {
    this.eventHandlers.clear();
    log.info(`[Skill] Cleaned up: ${this.getManifest().id}`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return { healthy: this.config.enabled };
  }

  /**
   * Get skill statistics
   */
  async getStats(): Promise<Record<string, any>> {
    return {
      skillId: this.getManifest().id,
      enabled: this.config.enabled,
      version: this.getManifest().version,
    };
  }
}
