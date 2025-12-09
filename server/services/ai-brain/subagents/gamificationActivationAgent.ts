/**
 * GAMIFICATION ACTIVATION AGENT
 * ==============================
 * Specialized subagent for universally activating gamification during org onboarding.
 * Enables organizations to unlock automation requirements through achievement progression.
 * 
 * Capabilities:
 * - Activate gamification for entire organization
 * - Setup default achievements and point systems
 * - Configure leaderboards
 * - Unlock automation gates based on gamification progress
 * - Assign starter badges to bootstrap engagement
 */

import { db } from '../../../db';
import { 
  achievements,
  employeePoints,
  employeeAchievements,
  employees,
  workspaces,
  type InsertAchievement,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { GamificationService, DEFAULT_ACHIEVEMENTS } from '../../gamification/gamificationService';

export interface ActivationResult {
  success: boolean;
  workspaceId: string;
  activatedFeatures: string[];
  achievementsCreated: number;
  employeesInitialized: number;
  automationGatesUnlocked: string[];
  errors: string[];
}

export interface AutomationGate {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  requiredAchievements: string[];
  unlocksBehavior: string;
}

const AUTOMATION_GATES: AutomationGate[] = [
  {
    id: 'basic_scheduling',
    name: 'AI Schedule Suggestions',
    description: 'Unlock AI-powered schedule recommendations',
    requiredLevel: 2,
    requiredAchievements: ['first_clock_in'],
    unlocksBehavior: 'scheduling.ai_suggestions',
  },
  {
    id: 'shift_swap',
    name: 'Auto Shift Swap',
    description: 'Enable automatic shift swap matching',
    requiredLevel: 3,
    requiredAchievements: ['week_warrior'],
    unlocksBehavior: 'scheduling.auto_swap',
  },
  {
    id: 'payroll_automation',
    name: 'Payroll Auto-Calculate',
    description: 'Automatic payroll calculation from timesheets',
    requiredLevel: 5,
    requiredAchievements: ['century_clubber'],
    unlocksBehavior: 'payroll.auto_calculate',
  },
  {
    id: 'compliance_alerts',
    name: 'Proactive Compliance Alerts',
    description: 'AI monitors for compliance issues before they happen',
    requiredLevel: 4,
    requiredAchievements: ['perfect_attendance'],
    unlocksBehavior: 'compliance.proactive_alerts',
  },
  {
    id: 'analytics_insights',
    name: 'AI Analytics Dashboard',
    description: 'Advanced AI-generated workforce insights',
    requiredLevel: 6,
    requiredAchievements: [],
    unlocksBehavior: 'analytics.ai_insights',
  },
  {
    id: 'full_automation',
    name: 'Full Automation Suite',
    description: 'Complete AI autonomy for routine operations',
    requiredLevel: 10,
    requiredAchievements: ['legend'],
    unlocksBehavior: 'automation.full_suite',
  },
];

const STARTER_BADGES: Omit<InsertAchievement, 'workspaceId'>[] = [
  {
    name: 'Welcome Aboard',
    description: 'Joined the platform',
    category: 'milestone',
    pointsValue: 5,
    rarity: 'common',
    triggerType: 'org_created',
    triggerThreshold: 1,
    icon: 'Sparkles',
  },
  {
    name: 'First Steps',
    description: 'Completed initial setup',
    category: 'milestone',
    pointsValue: 10,
    rarity: 'common',
    triggerType: 'setup_complete',
    triggerThreshold: 1,
    icon: 'Footprints',
  },
  {
    name: 'Data Pioneer',
    description: 'Imported initial workforce data',
    category: 'milestone',
    pointsValue: 25,
    rarity: 'uncommon',
    triggerType: 'data_imported',
    triggerThreshold: 1,
    icon: 'Database',
  },
];

interface GamificationConfig {
  enabled: boolean;
  activatedAt: string;
  pointsConfig?: {
    clockInPoints: number;
    overtimeMultiplier: number;
    streakBonus: number;
    weeklyBonusThreshold: number;
  };
  leaderboards?: {
    enabled: boolean;
    types: string[];
    displayLimit: number;
  };
  automationGatesUnlocked?: string[];
}

class GamificationActivationAgent {
  private static instance: GamificationActivationAgent;
  private gamificationService: GamificationService;
  private configCache: Map<string, GamificationConfig> = new Map();

  constructor() {
    this.gamificationService = new GamificationService();
  }

  static getInstance(): GamificationActivationAgent {
    if (!GamificationActivationAgent.instance) {
      GamificationActivationAgent.instance = new GamificationActivationAgent();
    }
    return GamificationActivationAgent.instance;
  }

  /**
   * Activate gamification for an organization
   * Called during org onboarding to universally enable gamification
   */
  async activateForOrg(params: {
    workspaceId: string;
    userId: string;
    options?: {
      includeStarterBadges?: boolean;
      initializeAllEmployees?: boolean;
      unlockBasicAutomation?: boolean;
    };
  }): Promise<ActivationResult> {
    const { workspaceId, userId, options = {} } = params;
    const { 
      includeStarterBadges = true, 
      initializeAllEmployees = true,
      unlockBasicAutomation = true,
    } = options;

    const result: ActivationResult = {
      success: true,
      workspaceId,
      activatedFeatures: [],
      achievementsCreated: 0,
      employeesInitialized: 0,
      automationGatesUnlocked: [],
      errors: [],
    };

    try {
      // Step 1: Initialize default achievements
      await this.gamificationService.initializeWorkspace(workspaceId);
      result.activatedFeatures.push('default_achievements');
      result.achievementsCreated += DEFAULT_ACHIEVEMENTS.length;

      // Step 2: Add starter badges for onboarding
      if (includeStarterBadges) {
        const starterCount = await this.setupStarterBadges(workspaceId);
        result.achievementsCreated += starterCount;
        result.activatedFeatures.push('starter_badges');
      }

      // Step 3: Enable gamification (store in memory/cache for now)
      await this.enableGamification(workspaceId);
      result.activatedFeatures.push('gamification_enabled');

      // Step 4: Initialize points for all existing employees
      if (initializeAllEmployees) {
        const initCount = await this.initializeEmployeePoints(workspaceId);
        result.employeesInitialized = initCount;
        result.activatedFeatures.push('employee_points_initialized');
      }

      // Step 5: Configure leaderboards
      await this.configureLeaderboards(workspaceId);
      result.activatedFeatures.push('leaderboards_configured');

      // Step 6: Unlock basic automation gates for new orgs
      if (unlockBasicAutomation) {
        const unlockedGates = await this.unlockAutomationGates(workspaceId, 1);
        result.automationGatesUnlocked = unlockedGates;
        if (unlockedGates.length > 0) {
          result.activatedFeatures.push('basic_automation_unlocked');
        }
      }

      // Step 7: Award "Welcome Aboard" badge to org owner
      await this.awardWelcomeBadge(workspaceId, userId);
      result.activatedFeatures.push('welcome_badge_awarded');

    } catch (error: any) {
      console.error('[GamificationActivationAgent] Activation failed:', error);
      result.success = false;
      result.errors.push(error.message);
    }

    console.log(`[GamificationActivationAgent] Activated for workspace ${workspaceId}:`, result);
    return result;
  }

  /**
   * Setup achievements for a workspace
   */
  async setupAchievements(params: {
    workspaceId: string;
    customAchievements?: Omit<InsertAchievement, 'workspaceId'>[];
  }): Promise<{ created: number; skipped: number }> {
    const { workspaceId, customAchievements = [] } = params;
    
    await this.gamificationService.initializeWorkspace(workspaceId);

    let created = 0;
    for (const achievement of customAchievements) {
      try {
        await db.insert(achievements).values({
          ...achievement,
          workspaceId,
          isActive: true,
        });
        created++;
      } catch (error) {
        // Skip duplicates
      }
    }

    return { created, skipped: customAchievements.length - created };
  }

  /**
   * Configure points system for a workspace
   */
  async configurePoints(params: {
    workspaceId: string;
    pointsConfig?: {
      clockInPoints?: number;
      overtimeMultiplier?: number;
      streakBonus?: number;
      weeklyBonusThreshold?: number;
    };
  }): Promise<boolean> {
    const { workspaceId, pointsConfig = {} } = params;

    const config = this.getOrCreateConfig(workspaceId);
    config.pointsConfig = {
      clockInPoints: pointsConfig.clockInPoints ?? 5,
      overtimeMultiplier: pointsConfig.overtimeMultiplier ?? 1.5,
      streakBonus: pointsConfig.streakBonus ?? 10,
      weeklyBonusThreshold: pointsConfig.weeklyBonusThreshold ?? 40,
    };
    this.configCache.set(workspaceId, config);

    console.log(`[GamificationActivationAgent] Points config updated for ${workspaceId}`);
    return true;
  }

  /**
   * Enable leaderboards for a workspace
   */
  async enableLeaderboards(params: {
    workspaceId: string;
    leaderboardTypes?: ('daily' | 'weekly' | 'monthly' | 'allTime')[];
  }): Promise<boolean> {
    const { workspaceId, leaderboardTypes = ['weekly', 'monthly', 'allTime'] } = params;

    const config = this.getOrCreateConfig(workspaceId);
    config.leaderboards = {
      enabled: true,
      types: leaderboardTypes,
      displayLimit: 10,
    };
    this.configCache.set(workspaceId, config);

    console.log(`[GamificationActivationAgent] Leaderboards enabled for ${workspaceId}`);
    return true;
  }

  /**
   * Unlock automation gates based on org's gamification level
   */
  async unlockAutomationGates(workspaceId: string, orgLevel: number): Promise<string[]> {
    const unlockedGates: string[] = [];
    const config = this.getOrCreateConfig(workspaceId);
    const currentUnlocked = config.automationGatesUnlocked || [];

    for (const gate of AUTOMATION_GATES) {
      if (orgLevel >= gate.requiredLevel && !currentUnlocked.includes(gate.id)) {
        currentUnlocked.push(gate.id);
        unlockedGates.push(gate.id);
      }
    }

    config.automationGatesUnlocked = currentUnlocked;
    this.configCache.set(workspaceId, config);

    if (unlockedGates.length > 0) {
      console.log(`[GamificationActivationAgent] Unlocked gates for ${workspaceId}:`, unlockedGates);
    }

    return unlockedGates;
  }

  /**
   * Assign starter badges to bootstrap engagement
   */
  async assignStarterBadges(params: {
    workspaceId: string;
    userId: string;
    employeeIds: string[];
  }): Promise<{ assigned: number; errors: string[] }> {
    const { workspaceId, userId, employeeIds } = params;
    let assigned = 0;
    const errors: string[] = [];

    const [welcomeAchievement] = await db.select()
      .from(achievements)
      .where(and(
        eq(achievements.workspaceId, workspaceId),
        eq(achievements.triggerType, 'org_created')
      ))
      .limit(1);

    if (!welcomeAchievement) {
      return { assigned: 0, errors: ['Welcome achievement not found'] };
    }

    for (const employeeId of employeeIds) {
      try {
        const existing = await db.select()
          .from(employeeAchievements)
          .where(and(
            eq(employeeAchievements.employeeId, employeeId),
            eq(employeeAchievements.achievementId, welcomeAchievement.id)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(employeeAchievements).values({
            workspaceId,
            employeeId,
            achievementId: welcomeAchievement.id,
            earnedAt: new Date(),
          });
          assigned++;
        }
      } catch (error: any) {
        errors.push(`Failed to assign badge to ${employeeId}: ${error.message}`);
      }
    }

    return { assigned, errors };
  }

  /**
   * Get available automation gates and their unlock status
   */
  async getAutomationGateStatus(workspaceId: string): Promise<{
    gates: (AutomationGate & { unlocked: boolean })[];
    currentLevel: number;
  }> {
    const config = this.getOrCreateConfig(workspaceId);
    const unlockedGates = config.automationGatesUnlocked || [];

    let currentLevel = 1;
    try {
      const [levelResult] = await db.select({
        avgLevel: sql<number>`COALESCE(AVG(current_level), 1)`,
        maxLevel: sql<number>`COALESCE(MAX(current_level), 1)`,
      })
        .from(employeePoints)
        .where(eq(employeePoints.workspaceId, workspaceId));

      currentLevel = Math.floor(levelResult?.maxLevel || 1);
    } catch (error) {
      // Fallback to level 1 if query fails (e.g., no employee_points yet)
    }

    return {
      gates: AUTOMATION_GATES.map(gate => ({
        ...gate,
        unlocked: unlockedGates.includes(gate.id),
      })),
      currentLevel,
    };
  }

  /**
   * Check if gamification is enabled for a workspace
   */
  isGamificationEnabled(workspaceId: string): boolean {
    const config = this.configCache.get(workspaceId);
    return config?.enabled ?? false;
  }

  /**
   * Get gamification config for a workspace
   */
  getGamificationConfig(workspaceId: string): GamificationConfig | null {
    return this.configCache.get(workspaceId) || null;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getOrCreateConfig(workspaceId: string): GamificationConfig {
    let config = this.configCache.get(workspaceId);
    if (!config) {
      config = {
        enabled: false,
        activatedAt: new Date().toISOString(),
      };
      this.configCache.set(workspaceId, config);
    }
    return config;
  }

  private async setupStarterBadges(workspaceId: string): Promise<number> {
    let created = 0;
    
    for (const badge of STARTER_BADGES) {
      try {
        const existing = await db.select()
          .from(achievements)
          .where(and(
            eq(achievements.workspaceId, workspaceId),
            eq(achievements.triggerType, badge.triggerType!)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(achievements).values({
            ...badge,
            workspaceId,
            isActive: true,
          });
          created++;
        }
      } catch (error) {
        console.error(`[GamificationActivationAgent] Failed to create badge ${badge.name}:`, error);
      }
    }

    return created;
  }

  private async enableGamification(workspaceId: string): Promise<void> {
    const config = this.getOrCreateConfig(workspaceId);
    config.enabled = true;
    config.activatedAt = new Date().toISOString();
    this.configCache.set(workspaceId, config);
    console.log(`[GamificationActivationAgent] Gamification enabled for ${workspaceId}`);
  }

  private async initializeEmployeePoints(workspaceId: string): Promise<number> {
    const workspaceEmployees = await db.select({ id: employees.id })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    let initialized = 0;
    for (const emp of workspaceEmployees) {
      try {
        await this.gamificationService.getOrCreateEmployeePoints(workspaceId, emp.id);
        initialized++;
      } catch (error) {
        // Skip errors for individual employees
      }
    }

    return initialized;
  }

  private async configureLeaderboards(workspaceId: string): Promise<void> {
    await this.enableLeaderboards({
      workspaceId,
      leaderboardTypes: ['weekly', 'monthly', 'allTime'],
    });
  }

  private async awardWelcomeBadge(workspaceId: string, userId: string): Promise<void> {
    const [employee] = await db.select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.userId, userId)
      ))
      .limit(1);

    if (employee) {
      await this.assignStarterBadges({
        workspaceId,
        userId,
        employeeIds: [employee.id],
      });
    }
  }
}

export const gamificationActivationAgent = GamificationActivationAgent.getInstance();
export { AUTOMATION_GATES };
