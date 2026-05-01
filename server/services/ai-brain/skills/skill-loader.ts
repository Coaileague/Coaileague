import { skillRegistry } from './skill-registry';
import { createLogger } from '../../../lib/logger';
import type { BaseSkill } from './base-skill';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module equivalent of _moduleDir — prefixed to avoid collision with esbuild shim
const _moduleFilename = fileURLToPath(import.meta.url);
const _moduleDir = dirname(_moduleFilename);

// Direct imports for revenue-critical skills (not directory-based)
import { payrollValidationSkill } from './payrollValidation';
import { invoiceReconciliationSkill } from './invoiceReconciliation';
import IntelligentSchedulerSkill from './intelligentScheduler';
import { trinityStaffingSkill } from './trinity-staffing-skill';
import { documentGeneratorSkill } from './documentGeneratorSkill';
import { dataResearchSkill } from './dataResearchSkill';
import { financialMathVerifierSkill } from './financialMathVerifierSkill';

// Create instances of revenue-critical skills
const intelligentSchedulerSkill = new IntelligentSchedulerSkill();

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
  private readonly log = createLogger('SkillLoader');

  constructor(skillsDirectory?: string) {
    this.skillsDirectory = skillsDirectory || path.join(_moduleDir, '.');
  }

  /**
   * Load all skills from the skills directory
   */
  async loadAllSkills(): Promise<number> {
    if (!fs.existsSync(this.skillsDirectory)) {
      this.log.warn(`Skills directory not found: ${this.skillsDirectory}`);
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
          this.log.info(`Skipping ${dir.name} - no index.ts/js found`);
          continue;
        }

        await this.loadSkill(dir.name);
        loadedCount++;
      } catch (error: unknown) {
        this.log.error(`Failed to load skill ${dir.name}:`, (error instanceof Error ? error.message : String(error)));
      }
    }

    this.log.info(`✅ Loaded ${loadedCount} AI Brain Skills`);
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

      this.log.info(`✅ Loaded skill: ${skillName}`);
    } catch (error: unknown) {
      throw new Error(`Failed to load skill ${skillName}: ${(error instanceof Error ? error.message : String(error))}`);
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
    
    this.log.info(`🔄 Reloaded skill: ${skillName}`);
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
      
      this.log.info(`🗑️ Unloaded skill: ${skillName}`);
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
        
        this.log.info(`Detected change in ${skillName}, reloading...`);
        
        try {
          await this.reloadSkill(skillName);
        } catch (error: unknown) {
          this.log.error(`Hot reload failed for ${skillName}:`, (error instanceof Error ? error.message : String(error)));
        }
      });

      this.log.info(`👀 Watching skills directory for changes`);
    } catch (error: unknown) {
      this.log.warn(`Could not watch skills directory:`, (error instanceof Error ? error.message : String(error)));
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
  const log = createLogger('SkillLoader');
  log.info('\n╔════════════════════════════════════════════════╗');
  log.info('║     🧠 AI BRAIN SKILLS SYSTEM STARTING        ║');
  log.info('╚════════════════════════════════════════════════╝\n');

  try {
    // CRITICAL: Register revenue-critical skills first (payroll, invoicing, scheduling)
    // These are core value proposition skills and must always be available
    log.info('Registering revenue-critical skills...');
    
    try {
      await skillRegistry.register(payrollValidationSkill);
      log.info('  ✅ PayrollValidationSkill registered');
    } catch (e: unknown) {
      log.warn('  ⚠️  PayrollValidationSkill skipped:', e.message);
    }
    
    try {
      await skillRegistry.register(invoiceReconciliationSkill);
      log.info('  ✅ InvoiceReconciliationSkill registered');
    } catch (e: unknown) {
      log.warn('  ⚠️  InvoiceReconciliationSkill skipped:', e.message);
    }
    
    try {
      await skillRegistry.register(intelligentSchedulerSkill);
      log.info('  ✅ IntelligentSchedulerSkill registered');
    } catch (e: unknown) {
      log.warn('  ⚠️  IntelligentSchedulerSkill skipped:', e.message);
    }
    
    try {
      await skillRegistry.register(trinityStaffingSkill);
      log.info('  ✅ TrinityStaffingSkill registered (Premier)');
    } catch (e: unknown) {
      log.warn('  ⚠️  TrinityStaffingSkill skipped:', e.message);
    }

    log.info('Registering v3 brain skills...');

    try {
      await skillRegistry.register(documentGeneratorSkill);
      log.info('  ✅ DocumentGeneratorSkill registered');
    } catch (e: unknown) {
      log.warn('  ⚠️  DocumentGeneratorSkill skipped:', e.message);
    }

    try {
      await skillRegistry.register(dataResearchSkill);
      log.info('  ✅ DataResearchSkill registered');
    } catch (e: unknown) {
      log.warn('  ⚠️  DataResearchSkill skipped:', e.message);
    }

    try {
      await skillRegistry.register(financialMathVerifierSkill);
      log.info('  ✅ FinancialMathVerifierSkill registered');
    } catch (e: unknown) {
      log.warn('  ⚠️  FinancialMathVerifierSkill skipped:', e.message);
    }

    // Load directory-based skills
    const loadedCount = await skillLoader.loadAllSkills();

    // Watch for changes in development
    if (process.env.NODE_ENV === 'development') {
      skillLoader.watchSkills();
    }

    // Health check
    const health = await skillRegistry.getHealth();

    log.info('\n╔════════════════════════════════════════════════╗');
    log.info(`║  AI BRAIN SKILLS: ${loadedCount + 7} LOADED                ║`);
    log.info(`║  HEALTHY: ${health.healthySkills}/${health.totalSkills}                             ║`);
    log.info(`║  REVENUE-CRITICAL: 4 (payroll, invoice, sched, staffing)║`);
    log.info(`║  V3 BRAIN: 3 (docgen, research, math-verify)            ║`);
    if (health.unhealthySkills.length > 0) {
      log.info(`║  ⚠️  UNHEALTHY: ${health.unhealthySkills.join(', ')}  ║`);
    }
    log.info('╚════════════════════════════════════════════════╝\n');
  } catch (error: unknown) {
    log.error('❌ Failed to initialize skills system:', (error instanceof Error ? error.message : String(error)));
  }
}
