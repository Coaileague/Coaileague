import type { BaseSkill } from './base-skill';
import type { SkillManifest, SkillContext, SkillResult, SkillEvent } from './types';

/**
 * Skill Registry - Central registry for all AI Brain Skills
 * 
 * Manages skill lifecycle, discovery, and execution.
 * Provides RBAC-aware skill execution with tier gating.
 */
export class SkillRegistry {
  private skills: Map<string, BaseSkill> = new Map();
  private static instance: SkillRegistry;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /**
   * Register a skill
   */
  async register(skill: BaseSkill): Promise<void> {
    const manifest = skill.getManifest();
    
    // Check dependencies
    if (manifest.dependencies) {
      for (const depId of manifest.dependencies) {
        if (!this.skills.has(depId)) {
          throw new Error(`Skill ${manifest.id} depends on ${depId}, but it's not registered`);
        }
      }
    }

    // Initialize and register
    await skill.initialize();
    this.skills.set(manifest.id, skill);
    
    console.log(`✅ [SkillRegistry] Registered: ${manifest.id} v${manifest.version}`);
  }

  /**
   * Unregister a skill
   */
  async unregister(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (skill) {
      await skill.cleanup();
      this.skills.delete(skillId);
      console.log(`🗑️  [SkillRegistry] Unregistered: ${skillId}`);
    }
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): BaseSkill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): BaseSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills by category
   */
  getSkillsByCategory(category: string): BaseSkill[] {
    return this.getAllSkills().filter(
      (skill) => skill.getManifest().category === category
    );
  }

  /**
   * Get available skills for a context (RBAC-aware)
   */
  async getAvailableSkills(context: SkillContext): Promise<SkillManifest[]> {
    const available: SkillManifest[] = [];

    for (const skill of this.skills.values()) {
      const canExecute = await skill.canExecute(context);
      if (canExecute) {
        available.push(skill.getManifest());
      }
    }

    return available;
  }

  /**
   * Execute a skill with RBAC checks
   */
  async executeSkill(
    skillId: string,
    context: SkillContext,
    params: any
  ): Promise<SkillResult> {
    const skill = this.skills.get(skillId);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`,
      };
    }

    // Check if user can execute this skill
    const canExecute = await skill.canExecute(context);
    if (!canExecute) {
      const manifest = skill.getManifest();
      return {
        success: false,
        error: `Access denied. Skill requires ${manifest.requiredTier || 'higher'} tier or specific roles.`,
        metadata: {
          requiredTier: manifest.requiredTier,
          requiredRole: manifest.requiredRole,
        },
      };
    }

    // Execute skill
    try {
      const result = await skill.execute(context, params);
      return result;
    } catch (error: any) {
      console.error(`[SkillRegistry] Error executing ${skillId}:`, error);
      return {
        success: false,
        error: error.message || 'Skill execution failed',
      };
    }
  }

  /**
   * Broadcast event to all skills
   */
  async broadcastEvent(event: SkillEvent): Promise<void> {
    const promises = Array.from(this.skills.values()).map((skill) =>
      skill.handleEvent(event)
    );
    await Promise.allSettled(promises);
  }

  /**
   * Get registry health status
   */
  async getHealth(): Promise<{
    totalSkills: number;
    healthySkills: number;
    unhealthySkills: string[];
  }> {
    const healthChecks = await Promise.all(
      Array.from(this.skills.entries()).map(async ([id, skill]) => ({
        id,
        health: await skill.healthCheck(),
      }))
    );

    const unhealthy = healthChecks
      .filter((check) => !check.health.healthy)
      .map((check) => check.id);

    return {
      totalSkills: this.skills.size,
      healthySkills: healthChecks.length - unhealthy.length,
      unhealthySkills: unhealthy,
    };
  }

  /**
   * Get all skill manifests (for discovery)
   */
  getManifests(): SkillManifest[] {
    return Array.from(this.skills.values()).map((skill) => skill.getManifest());
  }
}

// Export singleton instance
export const skillRegistry = SkillRegistry.getInstance();
