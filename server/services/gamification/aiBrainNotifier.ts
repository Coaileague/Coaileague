import { gamificationEvents, type MilestoneEvent, type AchievementEvent } from './gamificationEvents';
import { publishPlatformUpdate } from '../platformEventBus';
import { db } from '../../db';
import {
  employees
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('aiBrainNotifier');


/**
 * Sends gamification milestones to AI Brain for onboarding insight
 * and personalized feature recommendations
 */
export class AiBrainNotifier {
  private static initialized = false;

  /**
   * Initialize AI Brain listeners for gamification events
   */
  static initializeListeners(): void {
    if (this.initialized) {
      log.info('[AiBrainNotifier] Already initialized, skipping');
      return;
    }

    // Listen for gamification milestones
    gamificationEvents.on('gamification_milestone', (data: MilestoneEvent) => this.notifyAiBrain(data));
    gamificationEvents.on('achievement_unlocked', (data: AchievementEvent) => this.notifyAchievement(data));

    this.initialized = true;
    log.info('[AiBrainNotifier] AI Brain notification system initialized');
  }

  private static async notifyAiBrain(data: MilestoneEvent): Promise<void> {
    try {
      const { type, workspaceId, employeeId, points, feature } = data;

      // Get employee info
      const [employee] = await db.select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!employee) return;

      // Get points summary
      const [pointsRecord] = await db.select()
        .from(employeePoints)
        .where(and(
          eq(employeePoints.workspaceId, workspaceId),
          eq(employeePoints.employeeId, employeeId)
        ))
        .limit(1);

      const payload = {
        type: 'gamification_milestone',
        milestone: type,
        employee: {
          id: employeeId,
          name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
          workspaceId,
        },
        stats: {
          totalPoints: pointsRecord?.totalPoints || 0,
          level: pointsRecord?.currentLevel || 1,
          streak: pointsRecord?.currentStreak || 0,
          pointsAwarded: points || 0,
        },
        metadata: {
          feature,
          timestamp: new Date().toISOString(),
        },
      };

      // Publish to platform for AI Brain consumption
      await publishPlatformUpdate({
        type: 'ai_brain_action',
        category: 'improvement',
        title: `Gamification: ${type}`,
        description: `Employee ${payload.employee.name} achieved milestone: ${type}`,
        workspaceId,
        metadata: payload,
        visibility: 'staff',
      });

      log.info(`[AiBrainNotifier] Notified AI Brain: ${type} for ${employeeId}`);
    } catch (error) {
      log.error('[AiBrainNotifier] Error notifying AI Brain:', error);
    }
  }

  private static async notifyAchievement(data: AchievementEvent): Promise<void> {
    try {
      const { achievement, employeeId, workspaceId, points } = data;

      // Publish achievement to platform
      await publishPlatformUpdate({
        type: 'announcement',
        category: 'announcement',
        title: `Achievement Unlocked: ${achievement.name}`,
        description: achievement.description,
        workspaceId,
        metadata: {
          achievementId: achievement.id,
          category: achievement.category,
          rarity: achievement.rarity,
          employeeId,
          pointsAwarded: points,
        },
        visibility: 'all',
        priority: achievement.rarity === 'legendary' ? 1 : achievement.rarity === 'rare' ? 2 : 3,
      });

      log.info(`[AiBrainNotifier] Achievement notification: ${achievement.name}`);
    } catch (error) {
      log.error('[AiBrainNotifier] Error notifying achievement:', error);
    }
  }

  private static calculatePriority(type: string): 'low' | 'medium' | 'high' {
    const highPriority = ['profile_complete', 'feature_adoption', 'level_up'];
    const mediumPriority = ['shift_swap', 'full_day_worked', 'early_arrival'];
    
    if (highPriority.includes(type)) return 'high';
    if (mediumPriority.includes(type)) return 'medium';
    return 'low';
  }

  /**
   * Get engagement insights for a user
   */
  static async getEngagementInsights(workspaceId: string, employeeId: string): Promise<any> {
    try {
      const [pointsRecord] = await db.select()
        .from(employeePoints)
        .where(and(
          eq(employeePoints.workspaceId, workspaceId),
          eq(employeePoints.employeeId, employeeId)
        ))
        .limit(1);

      if (!pointsRecord) return null;

      return {
        engagement_level: pointsRecord.currentLevel || 1,
        activity_score: pointsRecord.totalPoints || 0,
        streak_status: pointsRecord.currentStreak || 0,
        monthly_performance: pointsRecord.pointsThisMonth || 0,
        achievements_count: pointsRecord.achievementsEarned || 0,
        last_active: pointsRecord.lastActivityAt,
      };
    } catch (error) {
      log.error('[AiBrainNotifier] Error getting engagement insights:', error);
      return null;
    }
  }
}
