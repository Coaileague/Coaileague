import { skillRegistry } from './skill-registry';
import type { BaseSkill } from './base-skill';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Skill Loader - Automatically discovers and loads skills from skills directory
 * 
 * Supports hot-reload capability for development.
 * Skills are loaded from subdirectories under server/services/ai-brain/skills/
 * 
 * Directory structure:
 * ```
 * skills/
 *   document-ocr/
 *     index.ts  (exports skill class)
 *     manifest.json (optional metadata)
 *   predictive-analytics/
 *     index.ts
 *   conversational-scheduling/
 *     index.ts
 * ```
 */
export class SkillLoader {
  private skillsDirectory: string;
  private loadedModules: Map<string, any> = new Map();

  constructor(skillsDirectory?: string) {
    this.skillsDirectory = skillsDirectory || path.join(__dirname, '.');
  }

  /**
   * Load all skills from the skills directory
   */
  async loadAllSkills(): Promise<number> {
    if (!fs.existsSync(this.skillsDirectory)) {
      console.warn(`[SkillLoader] Skills directory not found: ${this.skillsDirectory}`);
      return 0;
    }

    const entries = fs.readdirSync(this.skillsDirectory, { withFileTypes: true });
    const skillDirs = entries.filter((entry) => entry.isDirectory());

    let loadedCount = 0;

    for (const dir of skillDirs) {
      try {
        const skillPath = path.join(this.skillsDirectory, dir.name, 'index.ts');
        const skillPathJs = path.join(this.skillsDirectory, dir.name, 'index.js');

        // Check if skill entry point exists
        if (!fs.existsSync(skillPath) && !fs.existsSync(skillPathJs)) {
          console.log(`[SkillLoader] Skipping ${dir.name} - no index.ts/js found`);
          continue;
        }

        await this.loadSkill(dir.name);
        loadedCount++;
      } catch (error: any) {
        console.error(`[SkillLoader] Failed to load skill ${dir.name}:`, error.message);
      }
    }

    console.log(`✅ [SkillLoader] Loaded ${loadedCount} AI Brain Skills`);
    return loadedCount;
  }

  /**
   * Load a specific skill by directory name
   */
  async loadSkill(skillName: string): Promise<void> {
    const skillPath = path.join(this.skillsDirectory, skillName);

    try {
      // Dynamic import of skill module
      const module = await import(skillPath);
      
      // Get the default export or named export
      const SkillClass = module.default || module[Object.keys(module)[0]];

      if (!SkillClass) {
        throw new Error(`No skill class exported from ${skillName}`);
      }

      // Instantiate skill
      const skillInstance: BaseSkill = new SkillClass();

      // Register with registry
      await skillRegistry.register(skillInstance);

      // Track loaded module for hot reload
      this.loadedModules.set(skillName, module);

      console.log(`✅ [SkillLoader] Loaded skill: ${skillName}`);
    } catch (error: any) {
      throw new Error(`Failed to load skill ${skillName}: ${error.message}`);
    }
  }

  /**
   * Reload a skill (for hot-reload during development)
   */
  async reloadSkill(skillName: string): Promise<void> {
    const skill = skillRegistry.getSkill(skillName);
    
    if (skill) {
      const manifest = skill.getManifest();
      await skillRegistry.unregister(manifest.id);
    }

    this.loadedModules.delete(skillName);
    await this.loadSkill(skillName);
    
    console.log(`🔄 [SkillLoader] Reloaded skill: ${skillName}`);
  }

  /**
   * Unload a skill
   */
  async unloadSkill(skillName: string): Promise<void> {
    const skill = skillRegistry.getSkill(skillName);
    
    if (skill) {
      const manifest = skill.getManifest();
      await skillRegistry.unregister(manifest.id);
      this.loadedModules.delete(skillName);
      
      console.log(`🗑️  [SkillLoader] Unloaded skill: ${skillName}`);
    }
  }

  /**
   * Watch skills directory for changes (development mode)
   */
  watchSkills(): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    try {
      fs.watch(this.skillsDirectory, { recursive: true }, async (eventType, filename) => {
        if (!filename || !filename.endsWith('.ts') && !filename.endsWith('.js')) {
          return;
        }

        const skillName = filename.split(path.sep)[0];
        
        console.log(`[SkillLoader] Detected change in ${skillName}, reloading...`);
        
        try {
          await this.reloadSkill(skillName);
        } catch (error: any) {
          console.error(`[SkillLoader] Hot reload failed for ${skillName}:`, error.message);
        }
      });

      console.log(`👀 [SkillLoader] Watching skills directory for changes`);
    } catch (error: any) {
      console.warn(`[SkillLoader] Could not watch skills directory:`, error.message);
    }
  }

  /**
   * Get loaded skill names
   */
  getLoadedSkills(): string[] {
    return Array.from(this.loadedModules.keys());
  }
}

// Export singleton instance
export const skillLoader = new SkillLoader();

/**
 * Initialize AI Brain Skills system
 * Call this from server startup
 */
export async function initializeSkillsSystem(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     🧠 AI BRAIN SKILLS SYSTEM STARTING        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    // Load all skills
    const loadedCount = await skillLoader.loadAllSkills();

    // Watch for changes in development
    if (process.env.NODE_ENV === 'development') {
      skillLoader.watchSkills();
    }

    // Health check
    const health = await skillRegistry.getHealth();

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║  ✅ AI BRAIN SKILLS: ${loadedCount} LOADED                ║`);
    console.log(`║  ✅ HEALTHY: ${health.healthySkills}/${health.totalSkills}                           ║`);
    if (health.unhealthySkills.length > 0) {
      console.log(`║  ⚠️  UNHEALTHY: ${health.unhealthySkills.join(', ')}  ║`);
    }
    console.log('╚════════════════════════════════════════════════╝\n');
  } catch (error: any) {
    console.error('❌ [SkillLoader] Failed to initialize skills system:', error.message);
  }
}
